import {
  idToPath,
  newTrace,
  type Issue,
  type LookupNode,
  type SourceFile,
} from "@sontx/simplink-core/browser";
import { httpPeer } from "@sontx/simplink-node/http-peer";
import { stringify } from "yaml";

export interface WriteOptions {
  create?: boolean;
}

export interface KBStore {
  name: string;
  kind: "directory" | "memory" | "remote";
  readonly readOnly?: boolean;
  readonly dirty?: boolean;
  readonly assets?: Record<string, Blob>;
  /** Authoritative lint issues from the source, refreshed by list(); replaces local lint. */
  readonly issues?: Issue[];
  list(): Promise<SourceFile[]>;
  read(relPath: string): Promise<string>;
  write(
    relPath: string,
    content: string,
    options?: WriteOptions,
  ): Promise<void>;
  remove(relPath: string): Promise<void>;
}

// Structural types keep the browser API testable without a global polyfill.
export interface DirectoryHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<DirectoryHandle | FileHandle>;
  getDirectoryHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<DirectoryHandle>;
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<FileHandle>;
  removeEntry(name: string): Promise<void>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
}

export interface FileHandle {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(content: string): Promise<void>;
    close(): Promise<void>;
    abort(): Promise<void>;
  }>;
}

export function directoryStore(handle: DirectoryHandle): KBStore {
  async function parent(relPath: string, create = false) {
    const segments = relPath.split("/");
    const name = segments.pop()!;
    let directory = handle;
    for (const part of segments)
      directory = await directory.getDirectoryHandle(part, { create });
    return { directory, name };
  }
  return {
    name: handle.name,
    kind: "directory",
    async list() {
      const files: SourceFile[] = [];
      async function walk(directory: DirectoryHandle, prefix: string) {
        for await (const entry of directory.values()) {
          if (entry.name.startsWith(".")) continue;
          const relPath = prefix + entry.name;
          if (entry.kind === "directory") await walk(entry, relPath + "/");
          else if (entry.name.endsWith(".md"))
            files.push({
              relPath,
              content: await (await entry.getFile()).text(),
            });
        }
      }
      await walk(handle, "");
      return files;
    },
    async read(relPath) {
      const { directory, name } = await parent(relPath);
      return (await (await directory.getFileHandle(name)).getFile()).text();
    },
    async write(relPath, content, { create = false } = {}) {
      const { directory, name } = await parent(relPath, true);
      if (create) {
        let exists = false;
        try {
          await directory.getFileHandle(name);
          exists = true;
        } catch (error) {
          if ((error as Error).name !== "NotFoundError") throw error;
        }
        if (exists) throw new Error("File already exists");
      }
      const file = await directory.getFileHandle(name, { create: true });
      const writable = await file.createWritable();
      try {
        await writable.write(content);
        await writable.close();
      } catch (error) {
        try {
          await writable.abort();
        } catch {
          /* Preserve the original failure. */
        }
        throw error;
      }
    },
    async remove(relPath) {
      const { directory, name } = await parent(relPath);
      await directory.removeEntry(name);
    },
  };
}

export function memoryStore(
  md: Record<string, string>,
  assets: Record<string, Blob> = {},
  name = "KB",
): KBStore {
  let dirty = false;
  const files = { ...md };
  return {
    name,
    kind: "memory",
    assets: { ...assets },
    get dirty() {
      return dirty;
    },
    async list() {
      return Object.entries(files).map(([relPath, content]) => ({
        relPath,
        content,
      }));
    },
    async read(relPath) {
      if (!Object.hasOwn(files, relPath)) throw new Error("File not found");
      return files[relPath];
    },
    async write(relPath, content, { create = false } = {}) {
      if (create && Object.hasOwn(files, relPath))
        throw new Error("File already exists");
      files[relPath] = content;
      dirty = true;
    },
    async remove(relPath) {
      if (!Object.hasOwn(files, relPath)) throw new Error("File not found");
      delete files[relPath];
      dirty = true;
    },
  };
}

// Rebuilds a node's Markdown file from its lookup form; formatting and comments are not preserved.
export function nodeMarkdown(n: LookupNode): string {
  const data = {
    type: n.type,
    title: n.title,
    summary: n.summary,
    ...(n.aliases.length ? { aliases: n.aliases } : {}),
    ...(n.tags.length ? { tags: n.tags } : {}),
    ...(n.status === "deprecated" ? { status: n.status } : {}),
    ...(n.availability ? { availability: n.availability } : {}),
    ...n.fields,
  };
  return `---\n${stringify(data)}---\n${n.body ?? ""}`;
}

// Keeps well-formed issues from an untrusted manifest; undefined when the node sends none.
export function manifestIssues(value: unknown): Issue[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item: Record<string, unknown> | null): Issue[] =>
    item &&
    typeof item.code === "string" &&
    typeof item.path === "string" &&
    typeof item.message === "string" &&
    (item.severity === "error" || item.severity === "warning")
      ? [
          {
            code: item.code,
            severity: item.severity,
            path: item.path,
            message: item.message,
            ...(Number.isInteger(item.line) && (item.line as number) > 0
              ? { line: item.line as number }
              : {}),
          },
        ]
      : [],
  );
}

// Read-only snapshot of a simp node's own KB: list every node, then fetch bodies through lookup.
export async function remoteStore(
  url: string,
  token?: string,
): Promise<KBStore> {
  const base = url.trim().replace(/\/+$/, "");
  // A bare origin means the default /simp base path.
  const peerUrl = new URL(base).pathname === "/" ? `${base}/simp` : base;
  const peerOptions = { token: token || undefined, timeoutMs: 30000 };
  const peer = httpPeer(peerUrl, peerOptions);
  const manifest = await peer.manifest().catch((error: Error) => {
    // Browsers report CORS refusals and unreachable hosts as the same TypeError.
    throw error instanceof TypeError
      ? new Error(
          `Cannot reach ${base}. Check the URL and that the node allows this page's origin (--allowed-origin ${globalThis.location?.origin ?? "<origin>"}).`,
        )
      : error;
  });
  const files: Record<string, string> = {};
  const readOnly = () => {
    throw new Error("Remote KBs are read-only");
  };
  // The node lints its original files, including ones that never become nodes;
  // re-linting the rebuilt copies would lose invalid values and line numbers.
  let issues = manifestIssues(manifest.issues);
  let listed = false;
  return {
    name: manifest.title || manifest.name,
    kind: "remote",
    readOnly: true,
    get issues() {
      return issues;
    },
    async list() {
      // The peer caches its manifest; a fresh client sees issues after a node reload.
      if (listed)
        issues = manifestIssues(
          (await httpPeer(peerUrl, peerOptions).manifest()).issues,
        );
      listed = true;
      const ids = (await peer.list!()).nodes.map((n) => n.id);
      for (const key of Object.keys(files)) delete files[key];
      // ponytail: fixed batches of 200; add a server-side page size if lookups hit maxBodyBytes.
      for (let i = 0; i < ids.length; i += 200) {
        const { nodes } = await peer.lookup({
          ids: ids.slice(i, i + 200),
          body: true,
          trace: newTrace(0),
        });
        for (const n of nodes) {
          const path = idToPath(n.id);
          if (path) files[path] = nodeMarkdown(n);
        }
      }
      return Object.entries(files).map(([relPath, content]) => ({
        relPath,
        content,
      }));
    },
    async read(relPath) {
      if (!Object.hasOwn(files, relPath)) throw new Error("File not found");
      return files[relPath];
    },
    write: readOnly,
    remove: readOnly,
  };
}

export async function pickFolder(): Promise<{
  store: KBStore;
  handle?: DirectoryHandle;
} | null> {
  if (!window.isSecureContext)
    throw new Error(
      "Open this page over HTTPS or localhost to access folders.",
    );
  const picker = (
    window as Window & {
      showDirectoryPicker?: (options: {
        mode: "readwrite";
      }) => Promise<DirectoryHandle>;
    }
  ).showDirectoryPicker;
  if (picker) {
    try {
      const handle = await picker.call(window, { mode: "readwrite" });
      return { store: directoryStore(handle), handle };
    } catch (error) {
      if ((error as Error).name === "AbortError") return null;
      throw new Error(`Folder access denied: ${(error as Error).message}`);
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.oncancel = () => resolve(null);
    // ponytail: focus fallback for browsers without the input cancel event; a pick committing after 1s reads as cancel.
    window.addEventListener(
      "focus",
      () =>
        setTimeout(() => {
          if (!input.files?.length) resolve(null);
        }, 1000),
      { once: true },
    );
    input.onchange = async () => {
      try {
        const files = [...(input.files ?? [])];
        if (!files.length) {
          resolve(null);
          return;
        }
        const md: Record<string, string> = {};
        const assets: Record<string, Blob> = {};
        for (const file of files) {
          const parts = file.webkitRelativePath.split("/");
          parts.shift();
          if (parts.some((part) => part.startsWith("."))) continue;
          const relPath = parts.join("/");
          if (relPath.endsWith(".md")) md[relPath] = await file.text();
          else assets[relPath] = file;
        }
        resolve({
          store: memoryStore(
            md,
            assets,
            files[0].webkitRelativePath.split("/")[0],
          ),
        });
      } catch (error) {
        reject(error);
      }
    };
    input.click();
  });
}

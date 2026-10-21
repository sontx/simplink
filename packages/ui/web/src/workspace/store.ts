import type { SourceFile } from "@sontx/simplink-core/browser";

export interface WriteOptions {
  create?: boolean;
}

export interface KBStore {
  name: string;
  kind: "directory" | "memory";
  readonly dirty?: boolean;
  readonly assets?: Record<string, Blob>;
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

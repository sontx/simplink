import {
  createKB,
  createKBTools,
  memorySource,
  compileValidator,
  deriveId,
  FOLDER_TO_TYPE,
  parseDoc,
  type KB,
  type KBNode,
} from "@sontx/simplink-core/browser";
import { zipSync, strToU8 } from "fflate";
import { schemas } from "../lib/frontmatter.js";
import { editEdges, edgeSchema } from "./edges.js";
import type { KBStore, WriteOptions } from "./store.js";
import type { Snapshot, NodeDetail } from "../api.js";

function safePath(path: string): void {
  if (
    typeof path !== "string" ||
    !path.endsWith(".md") ||
    path.includes("\\") ||
    path.split("/").some((part) => !part || part === "." || part === "..") ||
    !deriveId(path).derivedId
  )
    throw new Error(
      "Invalid path: expected a relative .md file under a node type folder",
    );
}

const validator = compileValidator(schemas);
const relationships = edgeSchema();

export class WorkspaceService {
  private kb!: KB;
  private files: Record<string, string> = {};
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private pageCache = new Map<string, ReturnType<KB["docs"]>>();
  stale = false;

  private constructor(readonly store: KBStore) {}

  static async open(store: KBStore): Promise<WorkspaceService> {
    const service = new WorkspaceService(store);
    await service.reload();
    return service;
  }

  close(): void {
    this.disposed = true;
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.queue.then(async () => {
      if (this.disposed) throw new Error("Workspace closed");
      return operation();
    });
    this.queue = task.catch(() => {});
    return task;
  }

  // Builds from this.files, which mirrors the store; only reload re-lists the folder.
  private async rebuild() {
    const kb = await createKB(
      memorySource({ ...this.files }, this.store.name),
      {
        validator,
      },
    );
    this.kb = kb;
    this.pageCache.clear();
    this.stale = false;
    return { status: kb.status, issues: kb.issues };
  }

  // The store already holds the change, so a failed rebuild marks the KB stale instead of failing the write.
  private async rebuildAfterWrite() {
    try {
      return await this.rebuild();
    } catch (error) {
      this.stale = true;
      console.error(error);
      return { status: this.kb.status, issues: this.kb.issues };
    }
  }

  reload() {
    return this.enqueue(async () => {
      try {
        this.files = Object.fromEntries(
          (await this.store.list()).map((file) => [file.relPath, file.content]),
        );
        return await this.rebuild();
      } catch (error) {
        this.stale = true;
        throw error;
      }
    });
  }

  snapshot(): Snapshot {
    return {
      status: this.kb.status,
      issues: this.kb.issues,
      nodes: [...this.kb.graph.nodes.values()].map(
        ({ id, type, path, title, summary, status, tags }) => ({
          id,
          type,
          path,
          title,
          summary,
          status,
          tags,
        }),
      ),
      edges: this.kb.graph.edges,
      stale: this.stale,
    };
  }

  schema() {
    return relationships;
  }

  search(q: string) {
    return this.kb.search(q);
  }

  callTool(name: string, args: unknown) {
    return this.enqueue(async () => {
      const tools = await createKBTools(this.kb);
      return tools.call(name, args);
    });
  }

  private pages(layout: string) {
    if (layout !== "site" && layout !== "graph")
      throw new Error("Invalid docs layout");
    let pages = this.pageCache.get(layout);
    if (!pages) this.pageCache.set(layout, (pages = this.kb.docs({ layout })));
    return pages;
  }

  docs(layout: string) {
    return this.pages(layout).map((page) => page.path);
  }

  exportDocsZip(layout: string): Uint8Array {
    return zipSync(
      Object.fromEntries(
        this.pages(layout).map((page) => [page.path, strToU8(page.content)]),
      ),
    );
  }

  page(layout: string, path: string) {
    const page = this.pages(layout).find((page) => page.path === path);
    if (!page) throw new Error("Not found");
    return page;
  }

  nodeDetail(id: string): NodeDetail {
    const node = this.kb.node(id);
    if (node)
      return {
        node,
        out: this.kb.graph.out.get(id) ?? [],
        in: this.kb.graph.in.get(id) ?? [],
        raw: this.files[node.path],
      };
    const [type, ...segments] = id.split(".");
    const folder = Object.keys(FOLDER_TO_TYPE).find(
      (key) => FOLDER_TO_TYPE[key] === type,
    );
    if (!folder || !segments.length) throw new Error("Node not found");
    const path = `${folder}/${segments.join("/")}.md`;
    safePath(path);
    if (!Object.hasOwn(this.files, path)) throw new Error("Node not found");
    const raw = this.files[path];
    const parsed = parseDoc(path, raw);
    return {
      node: {
        id,
        type: parsed.folderType!,
        path,
        title: typeof parsed.data.title === "string" ? parsed.data.title : id,
        summary:
          typeof parsed.data.summary === "string" ? parsed.data.summary : "",
        tags: [],
        aliases: [],
        status: "active",
        data: parsed.data,
        body: parsed.body,
      },
      out: [],
      in: [],
      raw,
    };
  }

  resolve(id: string) {
    const node = this.kb.node(id);
    if (!node) throw new Error("Node not found");
    if (node.type !== "goal" && node.type !== "procedure")
      throw new Error("Only goals and procedures have plans");
    const resolved =
      node.type === "goal"
        ? this.kb.resolveGoal(id)
        : this.kb.resolveProcedure(id);
    return this.kb
      .render(resolved)
      .then((rendered) => ({ resolved, rendered }));
  }

  writeFile(path: string, content: string, options: WriteOptions = {}) {
    return this.enqueue(async () => {
      safePath(path);
      if (typeof content !== "string")
        throw new Error("Expected string content");
      await this.store.write(path, content, options);
      this.files[path] = content;
      return this.rebuildAfterWrite();
    });
  }

  deleteFile(path: string) {
    return this.enqueue(async () => {
      safePath(path);
      await this.store.remove(path);
      delete this.files[path];
      return this.rebuildAfterWrite();
    });
  }

  patchEdges(id: string, kind: string, targets: string[]) {
    return this.enqueue(async () => {
      const node: KBNode | undefined = this.kb.node(id);
      if (!node) throw new Error("Node not found");
      const targetType =
        typeof kind === "string" &&
        Object.hasOwn(relationships[node.type], kind)
          ? relationships[node.type][kind]
          : undefined;
      if (
        !targetType ||
        !Array.isArray(targets) ||
        new Set(targets).size !== targets.length ||
        !targets.every(
          (target) =>
            typeof target === "string" &&
            !!this.kb.node(target) &&
            (targetType === "node" ||
              this.kb.node(target)?.type === targetType),
        )
      )
        throw new Error("Invalid relationship kind or targets");
      safePath(node.path);
      // Re-read so edits made outside the app since the last rebuild are kept.
      const content = editEdges(
        await this.store.read(node.path),
        kind,
        targets,
      );
      await this.store.write(node.path, content);
      this.files[node.path] = content;
      return this.rebuildAfterWrite();
    });
  }

  exportZip(): Promise<Uint8Array> {
    return this.enqueue(async () => {
      if (this.store.kind !== "memory")
        throw new Error("Zip download is only needed in memory mode");
      const entries: Record<string, Uint8Array> = {};
      const allowed = (path: string) =>
        !path.includes("\\") &&
        !path.split("/").some((part) => !part || part.startsWith("."));
      for (const file of await this.store.list())
        if (allowed(file.relPath))
          entries[file.relPath] = strToU8(file.content);
      for (const [path, blob] of Object.entries(this.store.assets ?? {}))
        if (allowed(path))
          entries[path] = new Uint8Array(await blob.arrayBuffer());
      return zipSync(entries);
    });
  }
}

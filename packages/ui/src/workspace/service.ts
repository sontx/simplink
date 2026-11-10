import {
  createFederatedKB,
  createKB,
  createKBTools,
  docAssets,
  memorySource,
  compileValidator,
  deriveId,
  FOLDER_TO_TYPE,
  parseDoc,
  simpDoc,
  type KB,
  type KBNode,
  type Peer,
  type PlanStep,
} from "@sontx/simplink-core/browser";
import { httpPeer } from "@sontx/simplink-node/http-peer";
import { zipSync, strToU8, type Zippable } from "fflate";
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

// Hidden, parent and absolute paths never reach the store or a zip.
const assetPath = (path: string) =>
  typeof path === "string" &&
  !path.includes("\\") &&
  !path.split("/").some((part) => !part || part.startsWith("."));

// Concurrent image reads in a docs zip export.
const ASSET_READS = 6;

const validator = compileValidator(schemas);
const relationships = edgeSchema();

export class WorkspaceService {
  private kb!: KB;
  private peers: Peer[] = [];
  private files: Record<string, string> = {};
  // The node file this session last wrote, so the graph can reopen where the author worked.
  private lastEdited?: string;
  // The last deleted file, kept so the author can undo the delete.
  private deleted?: {
    path: string;
    content: string;
    id?: string;
    title: string;
  };
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
    const source = memorySource({ ...this.files }, this.store.name);
    // Lists names only, so lint can report missing images (W110) without reading them.
    const assets = this.store.assetPaths;
    if (assets) source.assets = () => [...assets];
    const kb = await createKB(source, { validator });
    this.kb = kb;
    // ponytail: only declared simp-node peers over HTTP(S), without tokens; static and folder peers need a server.
    this.peers = (simpDoc(kb.graph)?.peers ?? []).flatMap((p) =>
      p.url && /^https?:/i.test(p.url)
        ? [httpPeer(p.url, { name: p.name })]
        : [],
    );
    this.pageCache.clear();
    this.stale = false;
    return this.lint();
  }

  // Issues and counts, preferring the store's own lint (a simp node's) over the rebuilt copy's.
  private lint() {
    const issues = this.store.issues;
    if (!issues) return { status: this.kb.status, issues: this.kb.issues };
    const errors = issues.filter((i) => i.severity === "error").length;
    return {
      status: { ...this.kb.status, errors, warnings: issues.length - errors },
      issues,
    };
  }

  // The store already holds the change, so a failed rebuild marks the KB stale instead of failing the write.
  private async rebuildAfterWrite() {
    try {
      return await this.rebuild();
    } catch (error) {
      this.stale = true;
      console.error(error);
      return this.lint();
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
      ...this.lint(),
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
      lastEdited: this.lastEdited,
      deleted: this.deleted && {
        path: this.deleted.path,
        id: this.deleted.id,
        title: this.deleted.title,
      },
      changed: this.store.changed,
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
      const tools = await createKBTools(
        await createFederatedKB({ local: this.kb, peers: this.peers }),
      );
      return tools.call(name, args);
    });
  }

  /** Generated wording follows `locale`; without one, the KB's declared language, then English. */
  private pages(layout: string, locale?: string) {
    if (layout !== "site" && layout !== "graph")
      throw new Error("Invalid docs layout");
    const key = `${layout}:${locale ?? ""}`;
    let pages = this.pageCache.get(key);
    if (!pages)
      this.pageCache.set(key, (pages = this.kb.docs({ layout, locale })));
    return pages;
  }

  docs(layout: string, locale?: string) {
    return this.pages(layout, locale).map((page) => page.path);
  }

  /** A local image for display: a lazily read File, or a remote KB's URL. */
  asset(relPath: string): Promise<Blob | string> {
    if (!this.store.asset || !assetPath(relPath))
      return Promise.reject(new Error("File not found"));
    return this.store.asset(relPath);
  }

  /** Pages plus the images they reference, stored uncompressed; missing or unreadable images are skipped, as simp-docs does. */
  async exportDocsZip(layout: string, locale?: string): Promise<Uint8Array> {
    const entries: Zippable = Object.fromEntries(
      this.pages(layout, locale).map((page) => [
        page.path,
        strToU8(page.content),
      ]),
    );
    const paths = docAssets(this.kb.graph);
    // A few reads at a time: a static KB fetches each image, often through the proxy.
    const bytes: (Uint8Array | undefined)[] = [];
    const read = async (i: number) => {
      try {
        const asset = await this.asset(paths[i]);
        const blob =
          typeof asset === "string"
            ? await this.store.assetBlob?.(paths[i])
            : asset;
        if (blob) bytes[i] = new Uint8Array(await blob.arrayBuffer());
      } catch {
        /* lint reports missing images (W110) */
      }
    };
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(ASSET_READS, paths.length) }, async () => {
        while (next < paths.length) await read(next++);
      }),
    );
    // Added in path order, so the zip is the same whatever order the reads finish in.
    for (const [i, path] of paths.entries())
      if (bytes[i]) entries[path] = [bytes[i], { level: 0 }];
    return zipSync(entries);
  }

  page(layout: string, path: string, locale?: string) {
    const page = this.pages(layout, locale).find((page) => page.path === path);
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

  /**
   * States and choices a goal or procedure plan can ask about, in plan order.
   * States are left unknown so every reachable check appears; answered
   * choices narrow the plan to their branch.
   */
  planInputs(
    id: string,
    choices: Record<string, string> = {},
  ): { states: string[]; choices: string[] } {
    const node = this.kb.node(id);
    if (node?.type !== "goal" && node?.type !== "procedure")
      return { states: [], choices: [] };
    const resolved =
      node.type === "goal"
        ? this.kb.resolveGoal(id, { choices })
        : this.kb.resolveProcedure(id, { choices });
    const states = new Set<string>();
    const keys = new Set<string>();
    const walk = (plan: PlanStep[]) => {
      for (const step of plan) {
        if (step.kind === "check") {
          states.add(step.state.id);
          continue;
        }
        for (const optional of step.optional ?? [])
          states.add(optional.state.id);
        for (const item of step.steps) {
          if (typeof item === "string") continue;
          keys.add(`${step.procedure.id}:${item.choice}`);
          for (const option of item.options) walk(option.plan);
        }
      }
    };
    for (const alternative of resolved.alternatives) walk(alternative.plan);
    return { states: [...states], choices: [...keys] };
  }

  resolve(id: string, locale?: string) {
    const node = this.kb.node(id);
    if (!node) throw new Error("Node not found");
    if (node.type !== "goal" && node.type !== "procedure")
      throw new Error("Only goals and procedures have plans");
    const resolved =
      node.type === "goal"
        ? this.kb.resolveGoal(id)
        : this.kb.resolveProcedure(id);
    return this.kb
      .render(resolved, { locale })
      .then((rendered) => ({ resolved, rendered }));
  }

  writeFile(path: string, content: string, options: WriteOptions = {}) {
    return this.enqueue(async () => {
      safePath(path);
      if (typeof content !== "string")
        throw new Error("Expected string content");
      await this.store.write(path, content, options);
      this.files[path] = content;
      this.lastEdited = path;
      return this.rebuildAfterWrite();
    });
  }

  deleteFile(path: string) {
    return this.enqueue(async () => {
      safePath(path);
      const content = this.files[path] ?? (await this.store.read(path));
      const node = [...this.kb.graph.nodes.values()].find(
        (n) => n.path === path,
      );
      await this.store.remove(path);
      delete this.files[path];
      this.deleted = {
        path,
        content,
        id: node?.id,
        title: node?.title ?? path,
      };
      if (this.lastEdited === path) this.lastEdited = undefined;
      return this.rebuildAfterWrite();
    });
  }

  /** Puts the last deleted file back exactly as it was. */
  restoreDeleted() {
    return this.enqueue(async () => {
      const deleted = this.deleted;
      if (!deleted) throw new Error("Nothing to restore");
      await this.store.write(deleted.path, deleted.content, { create: true });
      this.files[deleted.path] = deleted.content;
      this.deleted = undefined;
      this.lastEdited = deleted.path;
      return this.rebuildAfterWrite();
    });
  }

  /** Forgets the last delete, so its notice goes away. */
  dismissDeleted() {
    this.deleted = undefined;
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
      // A node never relates to itself; under a plan-step kind it would be a cycle.
      if (targets.includes(id))
        throw new Error("A node can't be related to itself");
      safePath(node.path);
      // Re-read so edits made outside the app since the last rebuild are kept.
      const content = editEdges(
        await this.store.read(node.path),
        kind,
        targets,
      );
      await this.store.write(node.path, content);
      this.files[node.path] = content;
      this.lastEdited = node.path;
      return this.rebuildAfterWrite();
    });
  }

  exportZip(): Promise<Uint8Array> {
    return this.enqueue(async () => {
      if (this.store.kind !== "memory")
        throw new Error("Zip download is only needed in memory mode");
      const entries: Record<string, Uint8Array> = {};
      for (const file of await this.store.list())
        if (assetPath(file.relPath))
          entries[file.relPath] = strToU8(file.content);
      for (const [path, blob] of Object.entries(this.store.assets ?? {}))
        if (assetPath(path))
          entries[path] = new Uint8Array(await blob.arrayBuffer());
      const zip = zipSync(entries);
      // Inside the queue, so no write can land between the copy and the reset.
      this.store.markDownloaded?.();
      return zip;
    });
  }
}

import { createKB, type KB, type KBStatus } from "../kb.js";
import { memorySource } from "../source.js";
import {
  renderResolvedGoal,
  type RenderOptions,
  type RenderResult,
} from "../render.js";
import type { ResolveOptions, ResolvedGoal } from "../resolve.js";
import type { SearchOptions, SearchResult } from "../search.js";
import { createPeerService } from "./service.js";
import { localize, parseRef } from "../ids.js";
import { simpDoc } from "../simp-doc.js";
import { resolveFederated, selectMode } from "./prefetch.js";
import { qualifyResolveResponse } from "./merge.js";
import {
  newTrace,
  type LookupNode,
  type Peer,
  type ResolutionMode,
  type SourceStatus,
} from "./protocol.js";

/**
 * Options for {@link createFederatedKB}, in one of three shapes: a local KB
 * with optional peers (standalone), a remote `home` simp that answers
 * everything (peer mode), or peers only (hub without a KB of its own).
 */
export type FederatedKBOptions =
  | {
      /** Local KB answered in-process. */
      local: KB;
      /** Peers reached directly. */
      peers?: Peer[];
      /** Forwarding hops per request. Defaults to `2`. */
      hops?: number;
      /** Per-peer request timeout in milliseconds. Defaults to `2000`. */
      timeoutMs?: number;
      /** Preferred resolution mode by peer name; overrides `simp.md` peer modes. */
      modes?: Record<string, ResolutionMode>;
    }
  | {
      /** Remote simp that answers every request, such as an `httpPeer`. */
      home: Peer;
      /** Forwarding hops per request. Defaults to `2`. */
      hops?: number;
    }
  | {
      /** No local KB. */
      local?: undefined;
      /** Peers reached directly. */
      peers: Peer[];
      /** Forwarding hops per request. Defaults to `2`. */
      hops?: number;
      /** Per-peer request timeout in milliseconds. Defaults to `2000`. */
      timeoutMs?: number;
      /** Preferred resolution mode by peer name. */
      modes?: Record<string, ResolutionMode>;
    };

/** KB status plus the name of the simp it represents. */
export interface FederatedStatus extends KBStatus {
  /** Simp name, when the KB or home simp has one. */
  simp?: string;
}

/** Search results across simps, with the status of every simp asked. */
export interface FederatedSearchResult extends SearchResult {
  /** Every simp asked, including failures. */
  sources: SourceStatus[];
}

/**
 * A KB facade whose reads span simps. IDs of other simps are qualified
 * (`crm:goal.x`), and unreachable peers produce warnings or failed sources
 * instead of errors. Tools from `createKBTools` run on this interface.
 */
export interface FederatedKB {
  /** The local KB, when there is one. */
  readonly local?: KB;
  /** Local KB status, or the home simp's name and error count. */
  readonly status: FederatedStatus;
  /** Searches the local KB and peers, merging the results. */
  search(query: string, opts?: SearchOptions): Promise<FederatedSearchResult>;
  /** Fetches one node with its body, or `undefined` when no simp has it. */
  node(id: string): Promise<LookupNode | undefined>;
  /** Fetches nodes by local or qualified ID; missing IDs are absent from the map. */
  nodes(
    ids: string[],
    opts?: { body?: boolean },
  ): Promise<Map<string, LookupNode>>;
  /** Resolves a goal, pulling or delegating nodes of other simps as needed. */
  resolveGoal(id: string, opts?: ResolveOptions): Promise<ResolvedGoal>;
  /** Resolves a procedure, pulling or delegating nodes of other simps as needed. */
  resolveProcedure(id: string, opts?: ResolveOptions): Promise<ResolvedGoal>;
  /** Renders a plan with the local KB's renderer, or the default renderer without one. */
  render(resolved: ResolvedGoal, opts?: RenderOptions): Promise<RenderResult>;
  /** Checks each directly configured peer's manifest within the timeout. */
  peers(): Promise<SourceStatus[]>;
}
const BRAND = Symbol.for("simplink.federated-kb");
/** Whether a value was created by {@link createFederatedKB}. */
export function isFederatedKB(value: unknown): value is FederatedKB {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[BRAND] === true
  );
}

/**
 * Creates a {@link FederatedKB}. With a local KB and no peers or cross-simp
 * references, it behaves like the local KB.
 *
 * @example
 * ```ts
 * const kb = await createFederatedKB({
 *   local: await createKB("kb"),
 *   peers: [httpPeer("https://crm.example/simp")],
 * });
 * const tools = await createKBTools(kb);
 * ```
 */
export async function createFederatedKB(
  opts: FederatedKBOptions,
): Promise<FederatedKB> {
  const local = "local" in opts ? opts.local : undefined;
  const hub = !("home" in opts)
    ? (local ?? (await createKB(memorySource({}))))
    : undefined;
  const service =
    "home" in opts
      ? opts.home
      : createPeerService({
          kb: hub!,
          peers: opts.peers,
          maxHops: opts.hops,
          timeoutMs: opts.timeoutMs,
          modes: opts.modes,
        });
  const manifest = await service.manifest();
  const crossRefs = [...(local?.graph.out.values() ?? [])].some((edges) =>
    edges.some((e) => parseRef(e.to).simp),
  );
  const direct = !("home" in opts) ? (opts.peers ?? []) : [opts.home];
  const modes = !("home" in opts)
    ? {
        ...Object.fromEntries(
          (hub && simpDoc(hub.graph)?.peers.map((p) => [p.name, p.mode])) || [],
        ),
        ...opts.modes,
      }
    : {};
  async function request<T>(action: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(action),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("timeout")),
            "timeoutMs" in opts ? (opts.timeoutMs ?? 2000) : 2000,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function resolve(
    kind: "goal" | "procedure",
    id: string,
    options: ResolveOptions = {},
  ) {
    const normalized = localize(id, manifest.name);
    // No peers and no cross-simp refs: skip the federated overlay copy of the whole graph.
    if (local && !direct.length && !crossRefs)
      return kind === "goal"
        ? local.resolveGoal(normalized, options)
        : local.resolveProcedure(normalized, options);
    const disabled = new Set<string>();
    await Promise.all(
      direct.map(async (peer) => {
        try {
          const info = await request(() => peer.manifest());
          if (!selectMode(modes[peer.name], info.serves))
            disabled.add(peer.name);
        } catch {
          /* lookup reports unreachable peers */
        }
      }),
    );
    const fetch = (ids: string[]) =>
      kb.nodes(
        ids.filter(
          (target) =>
            !disabled.has(
              parseRef(target).simp ?? ("home" in opts ? service.name : ""),
            ),
        ),
        { body: true },
      );
    return resolveFederated(
      local,
      kind,
      normalized,
      options,
      fetch,
      async (target) => {
        const owner = parseRef(target).simp;
        const home = "home" in opts;
        if (!home && (opts.hops ?? 2) <= 0) return undefined;
        const peer = !("home" in opts)
          ? direct.find((p) => p.name === owner)
          : service;
        if (!peer || !peer.resolve) return undefined;
        const info = await request(() => peer.manifest());
        if (
          selectMode(owner ? modes[owner] : undefined, info.serves) !==
          "delegate"
        )
          return undefined;
        const scoped = <T>(values: Record<string, T> | undefined) =>
          values &&
          Object.fromEntries(
            Object.entries(values)
              .filter(([key]) => key.startsWith(`${peer.name}:`))
              .map(([key, value]) => [key.slice(peer.name.length + 1), value]),
          );
        const response = await request(() =>
          peer.resolve!({
            target: localize(target, peer.name),
            states: home ? options.states : scoped(options.states),
            choices: home ? options.choices : scoped(options.choices),
            maxDepth: options.maxDepth,
            trace: home
              ? newTrace(opts.hops)
              : {
                  ...newTrace((opts.hops ?? 2) - 1),
                  visited: manifest.name ? [manifest.name] : [],
                },
          }),
        );
        return !("home" in opts)
          ? qualifyResolveResponse(response, peer.name, manifest.name)
          : response;
      },
    );
  }
  const kb: FederatedKB = {
    local,
    status: {
      ...(local?.status ?? {
        root: manifest.name,
        nodes: 0,
        edges: 0,
        errors: manifest.errors,
        warnings: 0,
      }),
      simp: manifest.name || undefined,
    },
    async search(query, options = {}) {
      const result = await service.explore({
        query,
        types: options.types,
        limit: options.limit,
        goalLimit: options.goalLimit,
        minRelevance: options.minRelevance,
        trace: newTrace(opts.hops),
      });
      return {
        query,
        ...result,
        hits: result.hits
          .filter((h) => h.relevance >= (options.minRelevance ?? 0.05))
          .slice(0, options.limit ?? 10),
        goals: result.goals
          .filter((g) => g.relevance >= (options.minRelevance ?? 0.05))
          .slice(0, options.goalLimit ?? 5),
      };
    },
    async node(id) {
      return (await kb.nodes([id], { body: true })).get(id);
    },
    async nodes(ids, options = {}) {
      const nodes = new Map(
        (
          await service.lookup({ ids, ...options, trace: newTrace(opts.hops) })
        ).nodes.map((n) => [n.id, n]),
      );
      for (const id of ids) {
        const node = nodes.get(localize(id, manifest.name));
        if (node) nodes.set(id, node);
      }
      return nodes;
    },
    async resolveGoal(id, options) {
      return resolve("goal", id, options);
    },
    async resolveProcedure(id, options) {
      return resolve("procedure", id, options);
    },
    async render(resolved, options) {
      return local
        ? local.render(resolved, options)
        : renderResolvedGoal(resolved, options);
    },
    async peers() {
      return Promise.all(
        direct.map(async (p) => {
          const start = Date.now();
          try {
            await request(() => p.manifest());
            return { simp: p.name, ok: true, ms: Date.now() - start };
          } catch (error) {
            return {
              simp: p.name,
              ok: false,
              error: error instanceof Error ? error.message : String(error),
              ms: Date.now() - start,
            };
          }
        }),
      );
    },
  };
  Object.defineProperty(kb, BRAND, { value: true });
  return kb;
}

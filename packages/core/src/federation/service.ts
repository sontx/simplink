import type { KB } from "../kb.js";
import { en } from "../i18n/en.js";
import { simpDoc } from "../simp-doc.js";
import { localize, parseRef } from "../ids.js";
import {
  acceptedOwners,
  mergeExplore,
  qualifyResponse,
  qualifyResolveResponse,
} from "./merge.js";
import {
  guaranteedStates,
  prefetch,
  resolveFederated,
  selectMode,
} from "./prefetch.js";
import type {
  ExploreResponse,
  ListResponse,
  LookupNode,
  LookupResponse,
  Peer,
  ResolutionMode,
  ResolveRequest,
  ResolveResponse,
  SourceStatus,
  Trace,
} from "./protocol.js";
import { PROTOCOL_VERSION } from "./protocol.js";

/** Options for {@link createPeerService}. */
export interface PeerServiceOptions {
  /** Local KB to answer from; its `simp.md` supplies the simp name and served modes. */
  kb: KB;
  /** Peers to forward to, or a function returning the current peers. */
  peers?: Peer[] | (() => Peer[]);
  /** Upper bound on forwarding hops, whatever a request asks. Defaults to `2`. */
  maxHops?: number;
  /** Per-peer request timeout in milliseconds. Defaults to `2000`. */
  timeoutMs?: number;
  /** Preferred resolution mode by peer name; overrides `simp.md` peer modes. */
  modes?: Record<string, ResolutionMode>;
  /** Receives structured entries for failed, unauthorized, and rejected peer responses. */
  log?: (entry: Record<string, unknown>) => void;
}

/** A {@link Peer} answered in-process from a local KB. */
export interface PeerService extends Peer {
  /** The KB this service answers from. */
  readonly kb: KB;
  /** Lists every local node without bodies. */
  list(): Promise<ListResponse>;
}
const COMMON_KEYS = new Set([
  "id",
  "type",
  "title",
  "summary",
  "aliases",
  "tags",
  "status",
  "availability",
  // Authoring evidence, never served: it can name private repo paths.
  "sources",
]);
/** Converts a local node to its protocol form, or returns `undefined` when the KB has no such node. */
export function toLookupNode(
  kb: KB,
  id: string,
  body: boolean,
): LookupNode | undefined {
  const n = kb.node(id);
  if (!n) return undefined;
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    summary: n.summary,
    status: n.status,
    aliases: n.aliases,
    tags: n.tags,
    ...(n.availability ? { availability: n.availability } : {}),
    fields: Object.fromEntries(
      Object.entries(n.data).filter(([k]) => !COMMON_KEYS.has(k)),
    ),
    ...(body ? { body: n.body } : {}),
    out: (kb.graph.out.get(id) ?? []).map(({ kind, to }) => ({ kind, to })),
    in: (kb.graph.in.get(id) ?? []).map(({ kind, from }) => ({ kind, from })),
  };
}

/**
 * Creates the in-process side of the simp protocol for a local KB. It answers
 * from the KB and forwards to peers within the trace's hops, qualifying remote
 * IDs and rejecting nodes from simps that did not answer. A failing peer
 * becomes a failed source instead of an error. `resolve` is present only when
 * `simp.md` serves `delegate`. Serve it over HTTP with `@sontx/simplink-node`.
 */
export function createPeerService(opts: PeerServiceOptions): PeerService {
  const { kb } = opts;
  const doc = simpDoc(kb.graph);
  const name = doc?.name ?? "";
  const peers = () =>
    typeof opts.peers === "function" ? opts.peers() : (opts.peers ?? []);
  const unauthorized = new Map<string, number>();
  // In-flight or settled manifest fetches by peer, so concurrent routes share one request.
  const manifests = new Map<string, Promise<string[] | undefined>>();
  const eligible = (trace: Trace) =>
    Math.min(trace.hops, opts.maxHops ?? 2) > 0
      ? peers().filter(
          (p) => p.name !== name && !trace.visited.includes(p.name),
        )
      : [];
  const forwarded = (trace: Trace): Trace => ({
    requestId: trace.requestId,
    hops: Math.min(trace.hops, opts.maxHops ?? 2) - 1,
    visited: [...new Set([...trace.visited, name])],
  });
  async function call<T>(
    peer: Peer,
    action: () => Promise<T>,
  ): Promise<{ value?: T; source: SourceStatus }> {
    const start = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        Promise.resolve().then(action),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("timeout")),
            opts.timeoutMs ?? 2000,
          );
        }),
      ]);
      return {
        value,
        source: { simp: peer.name, ok: true, ms: Date.now() - start },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message !== "unauthorized" ||
        Date.now() - (unauthorized.get(peer.name) ?? -Infinity) >= 60000
      ) {
        opts.log?.({
          msg: message === "unauthorized" ? "peer unauthorized" : "peer failed",
          peer: peer.name,
          error: message,
        });
        if (message === "unauthorized") unauthorized.set(peer.name, Date.now());
      }
      return {
        source: {
          simp: peer.name,
          ok: false,
          error: message,
          ms: Date.now() - start,
        },
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const accepted = (peer: Peer, sources: SourceStatus[], id: string) => {
    const ok = acceptedOwners(peer.name, sources).has(
      parseRef(id).simp ?? peer.name,
    );
    if (!ok) opts.log?.({ msg: "rejected node", peer: peer.name, id });
    return ok;
  };
  async function routeOwner(owner: string, trace: Trace): Promise<Peer[]> {
    const available = eligible(trace);
    const direct = available.find((p) => p.name === owner);
    if (direct) return [direct];
    const advertisedBy = await Promise.all(
      available.map((p) => {
        let peers = manifests.get(p.name);
        if (!peers) {
          peers = call(p, () => p.manifest()).then((result) => {
            if (!result.value) manifests.delete(p.name);
            return result.value?.peers;
          });
          manifests.set(p.name, peers);
        }
        return peers;
      }),
    );
    const advertised = available.filter((_, i) =>
      advertisedBy[i]?.includes(owner),
    );
    return advertised.length ? advertised : available;
  }
  const service: PeerService = {
    kb,
    name,
    async manifest() {
      return {
        protocol: PROTOCOL_VERSION,
        name,
        title: doc?.title ?? "",
        summary: doc?.summary ?? "",
        tags: doc?.tags ?? [],
        serves: doc?.serves ?? ["pull"],
        ...(doc?.docsUrl ? { docs_url: doc.docsUrl } : {}),
        peers: doc?.peers.map((p) => p.name) ?? [],
        errors: kb.status.errors,
        issues: kb.issues,
      };
    },
    async list() {
      return {
        nodes: [...kb.graph.nodes.keys()].flatMap(
          (id) => toLookupNode(kb, id, false) ?? [],
        ),
      };
    },
    async explore(r): Promise<ExploreResponse> {
      const start = Date.now();
      const result = await kb.search(r.query, {
        types: r.types,
        limit: r.limit,
        goalLimit: r.goalLimit,
        minRelevance: r.minRelevance,
      });
      const local = {
        hits: result.hits,
        goals: result.goals,
        sources: [{ simp: name, ok: true, ms: Date.now() - start }],
      };
      const remote = await Promise.all(
        eligible(r.trace).map(async (peer): Promise<ExploreResponse> => {
          const response = await call(peer, () =>
            peer.explore({ ...r, trace: forwarded(r.trace) }),
          );
          if (!response.value)
            return { hits: [], goals: [], sources: [response.source] };
          const value = response.value;
          return qualifyResponse(
            {
              ...value,
              hits: value.hits.filter((h) =>
                accepted(peer, value.sources, h.id),
              ),
              goals: value.goals.filter((g) =>
                accepted(peer, value.sources, g.id),
              ),
              sources: [response.source, ...value.sources],
            },
            peer.name,
            name,
          );
        }),
      );
      return mergeExplore(local, remote, kb.graph, {
        limit: r.limit ?? 10,
        goalLimit: r.goalLimit ?? 5,
        minRelevance: r.minRelevance ?? 0.05,
      });
    },
    async lookup(r): Promise<LookupResponse> {
      const start = Date.now();
      const ids = [...new Set(r.ids.map((id) => localize(id, name)))];
      const nodes = new Map<string, LookupNode>();
      const sources: SourceStatus[] = [
        { simp: name, ok: true, ms: Date.now() - start },
      ];
      const groups = new Map<string, string[]>();
      for (const id of ids) {
        const owner = parseRef(id).simp;
        if (owner) groups.set(owner, [...(groups.get(owner) ?? []), id]);
        else {
          const node = toLookupNode(kb, id, r.body ?? false);
          if (node) nodes.set(id, node);
        }
      }
      // Merge every owner routed to a peer into one forwarded lookup, so the
      // number of distinct owners in a request cannot multiply peer traffic.
      const routed = new Map<Peer, Set<string>>();
      await Promise.all(
        [...groups].map(async ([owner, wanted]) => {
          for (const peer of await routeOwner(owner, r.trace)) {
            const ids = routed.get(peer) ?? new Set<string>();
            wanted.forEach((id) => ids.add(id));
            routed.set(peer, ids);
          }
        }),
      );
      const responses = await Promise.all(
        [...routed].map(async ([peer, wanted]) => {
          const response = await call(peer, () =>
            peer.lookup({
              ...r,
              ids: [...wanted].map((id) => localize(id, peer.name)),
              trace: forwarded(r.trace),
            }),
          );
          if (!response.value)
            return { wanted, nodes: [], sources: [response.source] };
          const value = response.value;
          return {
            wanted,
            ...qualifyResponse(
              {
                ...value,
                nodes: value.nodes.filter((n) =>
                  accepted(peer, value.sources, n.id),
                ),
                sources: [response.source, ...value.sources],
              },
              peer.name,
              name,
            ),
          };
        }),
      );
      for (const response of responses) {
        sources.push(...response.sources);
        for (const node of response.nodes)
          if (response.wanted.has(node.id) && !nodes.has(node.id))
            nodes.set(node.id, node);
      }
      const statuses = new Map<string, SourceStatus>();
      for (const source of sources)
        if (!statuses.has(source.simp) || source.ok)
          statuses.set(source.simp, source);
      return {
        nodes: [...nodes.values()],
        missing: ids.filter((id) => !nodes.has(id)),
        sources: [...statuses.values()],
      };
    },
  };
  if (doc?.serves.includes("delegate"))
    service.resolve = async (r: ResolveRequest): Promise<ResolveResponse> => {
      const target = localize(r.target, name);
      const owner = parseRef(target).simp;
      const sources: SourceStatus[] = [{ simp: name, ok: true, ms: 0 }];
      const modes = {
        ...Object.fromEntries(doc.peers.map((p) => [p.name, p.mode])),
        ...opts.modes,
      };
      if (owner)
        for (const peer of await routeOwner(owner, r.trace)) {
          if (!peer.resolve) continue;
          const manifest = await call(peer, () => peer.manifest());
          const serves = manifest.value?.serves ?? [];
          // The owner honours the configured mode; intermediaries only need to forward delegation.
          if (
            peer.name === owner
              ? selectMode(modes[owner], serves) !== "delegate"
              : !serves.includes("delegate")
          )
            continue;
          const localized = <T>(values: Record<string, T> | undefined) =>
            values &&
            Object.fromEntries(
              Object.entries(values).map(([key, value]) => {
                const qualified = /^[a-z0-9]+(?:-[a-z0-9]+)*:/.test(key)
                  ? key
                  : `${name}:${key}`;
                return [
                  qualified.startsWith(`${peer.name}:`)
                    ? qualified.slice(peer.name.length + 1)
                    : qualified,
                  value,
                ];
              }),
            );
          const response = await call(peer, () =>
            peer.resolve!({
              ...r,
              target: localize(target, peer.name),
              states: localized(r.states),
              choices: localized(r.choices),
              trace: forwarded(r.trace),
            }),
          );
          sources.push(response.source);
          if (
            response.value &&
            accepted(
              peer,
              response.value.sources,
              response.value.resolved.goal.id,
            )
          ) {
            try {
              const qualified = qualifyResolveResponse(
                response.value,
                peer.name,
                name,
              );
              return {
                ...qualified,
                sources: [...sources, ...qualified.sources],
              };
            } catch (error) {
              opts.log?.({
                msg: "rejected node",
                peer: peer.name,
                error: String(error),
              });
            }
          }
        }
      const disabled = new Set<string>();
      await Promise.all(
        eligible(r.trace).map(async (peer) => {
          const info = await call(peer, () => peer.manifest());
          if (info.value && !selectMode(modes[peer.name], info.value.serves))
            disabled.add(peer.name);
        }),
      );
      // resolveFederated and the availability overlay prefetch the same ids; look each up once.
      const cache = new Map<string, LookupNode | undefined>();
      const fetch = async (ids: string[]) => {
        const wanted = ids.filter(
          (id) => !cache.has(id) && !disabled.has(parseRef(id).simp ?? ""),
        );
        if (wanted.length) {
          const result = await service.lookup({
            ids: wanted,
            body: true,
            trace: r.trace,
          });
          sources.push(...result.sources);
          const found = new Map(result.nodes.map((n) => [n.id, n]));
          for (const id of wanted) cache.set(id, found.get(id));
        }
        return new Map(
          ids.flatMap((id) => {
            const n = cache.get(id);
            return n ? [[id, n] as const] : [];
          }),
        );
      };
      const remoteResults = new Map<
        string,
        Promise<ResolveResponse | undefined>
      >();
      const resolveRemote = async (id: string) => {
        const peer = eligible(r.trace).find(
          (p) => p.name === parseRef(id).simp,
        );
        if (!peer?.resolve) return undefined;
        const info = await call(peer, () => peer.manifest());
        if (
          !info.value ||
          selectMode(modes[peer.name], info.value.serves) !== "delegate"
        )
          return undefined;
        const scoped = <T>(values: Record<string, T> | undefined) =>
          values &&
          Object.fromEntries(
            Object.entries(values)
              .filter(([key]) => key.startsWith(`${peer.name}:`))
              .map(([key, value]) => [key.slice(peer.name.length + 1), value]),
          );
        const result = await call(peer, () =>
          peer.resolve!({
            target: localize(id, peer.name),
            states: scoped(r.states),
            choices: scoped(r.choices),
            maxDepth: r.maxDepth,
            trace: forwarded(r.trace),
          }),
        );
        sources.push(result.source);
        return result.value
          ? qualifyResolveResponse(result.value, peer.name, name)
          : undefined;
      };
      const remote = (id: string) => {
        let result = remoteResults.get(id);
        if (!result) {
          result = resolveRemote(id);
          remoteResults.set(id, result);
        }
        return result;
      };
      const kind = parseRef(target).id.startsWith("goal.")
        ? "goal"
        : "procedure";
      const options = {
        states: r.states,
        choices: r.choices,
        maxDepth: r.maxDepth,
        availability: () => [],
      };
      const resolved = await resolveFederated(
        kb,
        kind,
        target,
        options,
        fetch,
        remote,
      );
      const overlay = await prefetch(
        target,
        kb.graph,
        fetch,
        r.maxDepth ?? 8,
        remote,
      );
      const warnNode = (id: string) => {
        if (overlay.graph.nodes.get(id)?.availability)
          resolved.warnings.push(en.diagnostics.availabilityNotChecked(id));
      };
      const warnAvailability = (plan: import("../resolve.js").PlanStep[]) => {
        for (const step of plan)
          if (step.kind === "run") {
            warnNode(step.procedure.id);
            step.optional?.forEach((optional) => warnNode(optional.state.id));
            for (const item of step.steps)
              if (typeof item !== "string")
                item.options.forEach((option) => {
                  option.capabilities.forEach((capability) =>
                    warnNode(capability.id),
                  );
                  option.constraints.forEach((constraint) =>
                    warnNode(constraint.id),
                  );
                  warnAvailability(option.plan);
                });
          } else warnNode(step.state.id);
      };
      resolved.alternatives.forEach((alternative) => {
        alternative.capabilities.forEach((capability) =>
          warnNode(capability.id),
        );
        alternative.constraints.forEach((constraint) =>
          warnNode(constraint.id),
        );
        warnAvailability(alternative.plan);
      });
      resolved.warnings = [...new Set(resolved.warnings)];
      const statuses = new Map<string, SourceStatus>();
      for (const source of sources)
        if (!statuses.has(source.simp) || source.ok)
          statuses.set(source.simp, source);
      return {
        resolved,
        produces: resolved.alternatives[0]
          ? guaranteedStates(resolved.alternatives[0], overlay.graph)
          : [],
        sources: [...statuses.values()],
      };
    };
  return service;
}

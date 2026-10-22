import type { KB } from "../kb.js";
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

export interface PeerServiceOptions {
  kb: KB;
  peers?: Peer[] | (() => Peer[]);
  maxHops?: number;
  timeoutMs?: number;
  modes?: Record<string, ResolutionMode>;
  log?: (entry: Record<string, unknown>) => void;
}

export interface PeerService extends Peer {
  readonly kb: KB;
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
]);
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

export function createPeerService(opts: PeerServiceOptions): PeerService {
  const { kb } = opts;
  const doc = simpDoc(kb.graph);
  const name = doc?.name ?? "";
  const peers = () =>
    typeof opts.peers === "function" ? opts.peers() : (opts.peers ?? []);
  const unauthorized = new Map<string, number>();
  const manifests = new Map<string, string[]>();
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
    await Promise.all(
      available.map(async (p) => {
        if (!manifests.has(p.name)) {
          const result = await call(p, () => p.manifest());
          if (result.value) manifests.set(p.name, result.value.peers);
        }
      }),
    );
    const advertised = available.filter((p) =>
      manifests.get(p.name)?.includes(owner),
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
      await Promise.all(
        [...groups].map(async ([owner, wanted]) => {
          const routes = await routeOwner(owner, r.trace);
          const responses = await Promise.all(
            routes.map(async (peer) => {
              const response = await call(peer, () =>
                peer.lookup({
                  ...r,
                  ids: wanted.map((id) => localize(id, peer.name)),
                  trace: forwarded(r.trace),
                }),
              );
              if (!response.value)
                return {
                  nodes: [],
                  missing: wanted,
                  sources: [response.source],
                };
              const value = response.value;
              return qualifyResponse(
                {
                  ...value,
                  nodes: value.nodes.filter((n) =>
                    accepted(peer, value.sources, n.id),
                  ),
                  sources: [response.source, ...value.sources],
                },
                peer.name,
                name,
              );
            }),
          );
          for (const response of responses) {
            sources.push(...response.sources);
            for (const node of response.nodes)
              if (wanted.includes(node.id) && !nodes.has(node.id))
                nodes.set(node.id, node);
          }
        }),
      );
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
      if (owner)
        for (const peer of await routeOwner(owner, r.trace)) {
          if (!peer.resolve) continue;
          const manifest = await call(peer, () => peer.manifest());
          if (!manifest.value?.serves.length) continue;
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
      const modes = {
        ...Object.fromEntries(doc.peers.map((p) => [p.name, p.mode])),
        ...opts.modes,
      };
      const disabled = new Set<string>();
      await Promise.all(
        eligible(r.trace).map(async (peer) => {
          const info = await call(peer, () => peer.manifest());
          if (info.value && !selectMode(modes[peer.name], info.value.serves))
            disabled.add(peer.name);
        }),
      );
      const fetch = async (ids: string[]) => {
        const result = await service.lookup({
          ids: ids.filter((id) => !disabled.has(parseRef(id).simp ?? "")),
          body: true,
          trace: r.trace,
        });
        sources.push(...result.sources);
        return new Map(result.nodes.map((n) => [n.id, n]));
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
          resolved.warnings.push(`availability of ${id} not checked`);
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

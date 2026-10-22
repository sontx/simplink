import { goalsOf } from "../graph.js";
import { localize, parseRef, qualify, rewriteRefs } from "../ids.js";
import type { KBGraph } from "../types.js";
import type { GoalHit, SearchHit } from "../search.js";
import type {
  ExploreResponse,
  LookupResponse,
  SourceStatus,
} from "./protocol.js";

/** Simps whose nodes are accepted from `peer`: the peer itself and every source that answered successfully. */
export function acceptedOwners(
  peer: string,
  sources: SourceStatus[],
): Set<string> {
  return new Set([peer, ...sources.filter((s) => s.ok).map((s) => s.simp)]);
}

/**
 * Rewrites a peer's explore or lookup response into the caller's view: the
 * peer's local IDs gain the `peer:` prefix, and IDs qualified with the caller's
 * own name `own` become local.
 */
export function qualifyResponse<T extends ExploreResponse | LookupResponse>(
  res: T,
  peer: string,
  own: string,
): T {
  const ref = (id: string) => localize(qualify(id, peer), own);
  if ("hits" in res)
    return {
      ...res,
      hits: res.hits.map((h) => ({
        ...h,
        id: ref(h.id),
        goals: h.goals.map(ref),
      })),
      goals: res.goals.map((g) => ({
        ...g,
        id: ref(g.id),
        via: g.via.map((v) => ({
          ...v,
          id: v.id === "self" ? "self" : ref(v.id),
        })),
      })),
    };
  return {
    ...res,
    nodes: res.nodes.map((n) => ({
      ...n,
      id: ref(n.id),
      fields: rewriteRefs(n.fields, ref),
      out: n.out.map((e) => ({ ...e, to: ref(e.to) })),
      in: n.in.map((e) => ({ ...e, from: ref(e.from) })),
    })),
    missing: res.missing.map(ref),
  };
}

/**
 * Merges local and already qualified remote search results. Remote relevance
 * is decayed by 0.9; remote hits also suggest local goals through
 * `localGraph`. Duplicates keep the highest relevance, ties favour local
 * results, and limits apply after merging. Each simp appears once in
 * `sources`, preferring a successful status.
 */
export function mergeExplore(
  local: ExploreResponse,
  remote: ExploreResponse[],
  localGraph: KBGraph | undefined,
  opts: { limit: number; goalLimit: number; minRelevance: number },
): ExploreResponse {
  const hits = new Map<string, SearchHit>();
  const goals = new Map<string, GoalHit>();
  const add = <T extends { id: string; relevance: number }>(
    map: Map<string, T>,
    item: T,
  ) => {
    if (!map.has(item.id) || map.get(item.id)!.relevance < item.relevance)
      map.set(item.id, item);
  };
  for (const hit of local.hits) add(hits, hit);
  for (const goal of local.goals) add(goals, goal);
  for (const response of remote) {
    for (const hit of response.hits) {
      const decayed = { ...hit, relevance: hit.relevance * 0.9 };
      add(hits, decayed);
      if (localGraph)
        for (const [id, hops] of goalsOf(localGraph, hit.id)) {
          const n = localGraph.nodes.get(id)!;
          const relevance = decayed.relevance * 0.6 ** hops;
          const previous = goals.get(id);
          const via = { id: hit.id, hops };
          if (previous) {
            goals.set(id, {
              ...previous,
              relevance: Math.max(previous.relevance, relevance),
              score: Math.max(previous.score, hit.score * 0.6 ** hops),
              via: [...previous.via, via]
                .sort((a, b) => a.hops - b.hops)
                .slice(0, 5),
            });
          } else
            add(goals, {
              id,
              title: n.title,
              summary: n.summary,
              score: hit.score * 0.6 ** hops,
              relevance,
              via: [via],
            });
        }
    }
    for (const goal of response.goals)
      add(goals, { ...goal, relevance: goal.relevance * 0.9 });
  }
  const sorted = <T extends { id: string; relevance: number }>(
    items: Map<string, T>,
    limit: number,
  ) =>
    [...items.values()]
      .filter((x) => x.relevance >= opts.minRelevance)
      .sort(
        (a, b) =>
          b.relevance - a.relevance ||
          Number(!!parseRef(a.id).simp) - Number(!!parseRef(b.id).simp),
      )
      .slice(0, limit);
  const sources = new Map<string, SourceStatus>();
  for (const source of [local, ...remote].flatMap((r) => r.sources))
    if (!sources.has(source.simp) || source.ok)
      sources.set(source.simp, source);
  return {
    hits: sorted(hits, opts.limit),
    goals: sorted(goals, opts.goalLimit),
    sources: [...sources.values()],
  };
}

/**
 * Rewrites a peer's resolved plan into the caller's view, as
 * {@link qualifyResponse} does for nodes, including IDs in plan steps and
 * warnings.
 *
 * @throws Error `rejected node` when the plan names a simp that is not an
 * {@link acceptedOwners | accepted owner}.
 */
export function qualifyResolveResponse(
  res: import("./protocol.js").ResolveResponse,
  peer: string,
  own: string,
): import("./protocol.js").ResolveResponse {
  const owners = acceptedOwners(peer, res.sources);
  const ref = (id: string) => {
    if (!owners.has(parseRef(id).simp ?? peer))
      throw new Error(`rejected node "${id}"`);
    return localize(qualify(id, peer), own);
  };
  const node = <T extends { id: string }>(n: T): T => ({ ...n, id: ref(n.id) });
  const warnings = (values: string[]) =>
    values.map((value) =>
      value.replace(
        /^availability of (\S+) not checked$/,
        (_, id: string) => `availability of ${ref(id)} not checked`,
      ),
    );
  const plan = (
    steps: import("../resolve.js").PlanStep[],
  ): import("../resolve.js").PlanStep[] =>
    steps.map((step) => {
      const when = step.when?.map((c) => ({ ...c, state: ref(c.state) }));
      if (step.kind === "check")
        return {
          ...step,
          state: node(step.state),
          ifFalse: step.ifFalse ? ref(step.ifFalse) : null,
          ...(when ? { when } : {}),
        };
      return {
        ...step,
        procedure: node(step.procedure),
        ...(when ? { when } : {}),
        optional: step.optional?.map((o) => ({
          ...o,
          state: node(o.state),
          fix: o.fix ? ref(o.fix) : null,
        })),
        steps: step.steps.map((s) =>
          typeof s === "string"
            ? s
            : {
                ...s,
                options: s.options.map((o) => ({
                  ...o,
                  procedure: node(o.procedure),
                  plan: plan(o.plan),
                  capabilities: o.capabilities.map(node),
                  constraints: o.constraints.map(node),
                  warnings: warnings(o.warnings),
                })),
              },
        ),
      };
    });
  return {
    ...res,
    produces: res.produces.map(ref),
    resolved: {
      ...res.resolved,
      goal: node(res.resolved.goal),
      warnings: warnings(res.resolved.warnings),
      alternatives: res.resolved.alternatives.map((a) => ({
        ...a,
        procedure: node(a.procedure),
        plan: plan(a.plan),
        capabilities: a.capabilities.map(node),
        constraints: a.constraints.map(node),
        satisfiedStates: a.satisfiedStates.map(ref),
        warnings: warnings(a.warnings),
      })),
    },
  };
}

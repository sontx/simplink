import type { KB } from "../kb.js";
import { buildGraph, getChoices } from "../graph.js";
import { EDGE_KINDS, type KBGraph, type KBNode } from "../types.js";
import {
  defaultAvailability,
  resolveGoal,
  resolveProcedure,
  type Alternative,
  type Condition,
  type PlanStep,
  type ResolveOptions,
  type ResolvedGoal,
} from "../resolve.js";
import type {
  LookupNode,
  ResolutionMode,
  ResolveResponse,
} from "./protocol.js";

export function toKBNode(n: LookupNode): KBNode {
  return {
    id: n.id,
    type: n.type,
    path: n.id.includes(":") ? `simp://${n.id.replace(":", "/")}` : n.id,
    title: n.title,
    summary: n.summary,
    status: n.status,
    aliases: n.aliases,
    tags: n.tags,
    availability: n.availability,
    data: n.fields,
    body: n.body ?? "",
  };
}

export function selectMode(
  preferred: ResolutionMode | undefined,
  serves: ResolutionMode[],
): ResolutionMode | undefined {
  return preferred && serves.includes(preferred)
    ? preferred
    : serves.includes("pull")
      ? "pull"
      : serves.includes("delegate")
        ? "delegate"
        : undefined;
}

export function fragmentNode(id: string, res: ResolveResponse): KBNode {
  return {
    id,
    type: "procedure",
    path: id,
    title: res.resolved.goal.title,
    summary: res.resolved.goal.summary,
    status: "active",
    aliases: [],
    tags: [],
    body: "",
    data: { produces: res.produces },
  };
}

export async function prefetch(
  target: string,
  local: KBGraph | undefined,
  fetch: (ids: string[]) => Promise<Map<string, LookupNode>>,
  maxDepth: number,
  resolveRemote?: (id: string) => Promise<ResolveResponse | undefined>,
): Promise<{
  graph: KBGraph;
  warnings: string[];
  fetched: number;
  fragments: Map<string, ResolveResponse>;
}> {
  const nodes = new Map(local?.nodes);
  const seen = new Set<string>();
  const warnings: string[] = [];
  const fragments = new Map<string, ResolveResponse>();
  let frontier = [target];
  let fetched = 0;
  for (let depth = 0; frontier.length && depth <= maxDepth; depth++) {
    const ids = [...new Set(frontier)].filter((id) => !seen.has(id));
    ids.forEach((id) => seen.add(id));
    const missing = ids.filter((id) => !nodes.has(id));
    const pull: string[] = [];
    for (const id of missing) {
      let fragment: ResolveResponse | undefined;
      if (resolveRemote && /^(?:[^:]+:)?procedure\./.test(id)) {
        try {
          fragment = await resolveRemote(id);
        } catch {
          /* fall back to lookup */
        }
      }
      if (fragment?.resolved.alternatives.length) {
        fragments.set(id, fragment);
        nodes.set(id, fragmentNode(id, fragment));
        warnings.push(
          ...fragment.resolved.warnings,
          ...fragment.resolved.alternatives[0].warnings,
        );
        fetched++;
      } else pull.push(id);
    }
    let result = new Map<string, LookupNode>();
    if (pull.length) {
      try {
        result = await fetch(pull);
      } catch {
        /* unavailable nodes become warnings */
      }
    }
    for (const id of pull) {
      const n = result.get(id);
      if (n) {
        nodes.set(id, toKBNode(n));
        fetched++;
      } else warnings.push(`unreachable node "${id}"`);
    }
    frontier = ids.flatMap((id) => {
      const n = nodes.get(id);
      if (!n || fragments.has(id)) return [];
      return [
        ...EDGE_KINDS.filter(
          (k) => k !== "related" && k !== "produces",
        ).flatMap((k) =>
          Array.isArray(n.data[k])
            ? (n.data[k] as unknown[]).filter(
                (v): v is string => typeof v === "string",
              )
            : [],
        ),
        ...getChoices(n).flatMap((c) => c.options.map((o) => o.procedure)),
      ];
    });
  }
  return {
    graph: buildGraph(nodes),
    warnings: [...new Set(warnings)],
    fetched,
    fragments,
  };
}

export function guaranteedStates(alt: Alternative, graph: KBGraph): string[] {
  const states = new Set<string>();
  const visit = (plan: PlanStep[], inherited: Condition[] = []) => {
    for (const step of plan) {
      const when = [...inherited, ...(step.when ?? [])];
      if (step.kind === "check") {
        if (!when.length) states.add(step.state.id);
        continue;
      }
      const produces = graph.nodes.get(step.procedure.id)?.data.produces;
      if (Array.isArray(produces))
        for (const id of produces) {
          if (
            typeof id === "string" &&
            (!when.length || when.every((c) => c.state === id))
          )
            states.add(id);
        }
      for (const item of step.steps)
        if (typeof item !== "string" && item.selected) {
          const selected = item.options.find((o) => o.key === item.selected);
          if (selected) visit(selected.plan, when);
        }
    }
  };
  visit(alt.plan);
  return [...states];
}

export function spliceFragments(
  resolved: ResolvedGoal,
  fragments: Map<string, ResolveResponse>,
): ResolvedGoal {
  const splice = (
    plan: PlanStep[],
    inherited: Condition[] = [],
    active = new Set<string>(),
  ): PlanStep[] =>
    plan.flatMap((step) => {
      const when = [...inherited, ...(step.when ?? [])];
      const fragment =
        step.kind === "run" ? fragments.get(step.procedure.id) : undefined;
      if (fragment && step.kind === "run" && !active.has(step.procedure.id)) {
        return splice(
          fragment.resolved.alternatives[0]?.plan ?? [],
          when,
          new Set([...active, step.procedure.id]),
        );
      }
      const result = { ...step, ...(when.length ? { when } : {}) };
      if (result.kind === "run")
        result.steps = result.steps.map((item) =>
          typeof item === "string"
            ? item
            : {
                ...item,
                options: item.options.map((o) => ({
                  ...o,
                  plan: splice(o.plan, when, active),
                })),
              },
        );
      return [result];
    });
  return {
    ...resolved,
    alternatives: resolved.alternatives.map((alt) => {
      const used = new Set<string>();
      const collect = (plan: PlanStep[]) => {
        for (const step of plan)
          if (step.kind === "run") {
            if (fragments.has(step.procedure.id)) used.add(step.procedure.id);
            for (const item of step.steps)
              if (typeof item !== "string")
                item.options.forEach((o) => collect(o.plan));
          }
      };
      collect(alt.plan);
      const remote = [...used].flatMap((id) =>
        fragments.get(id)!.resolved.alternatives.slice(0, 1),
      );
      return {
        ...alt,
        plan: splice(alt.plan),
        capabilities: [
          ...alt.capabilities,
          ...remote.flatMap((a) => a.capabilities),
        ],
        constraints: [
          ...alt.constraints,
          ...remote.flatMap((a) => a.constraints),
        ],
        warnings: [
          ...new Set([...alt.warnings, ...remote.flatMap((a) => a.warnings)]),
        ],
      };
    }),
  };
}

export async function resolveFederated(
  local: KB | undefined,
  kind: "goal" | "procedure",
  id: string,
  opts: ResolveOptions,
  fetch: (ids: string[]) => Promise<Map<string, LookupNode>>,
  resolveRemote?: (id: string) => Promise<ResolveResponse | undefined>,
): Promise<ResolvedGoal> {
  const base = local?.resolveOptions(opts) ?? opts;
  const overlay = await prefetch(
    id,
    local?.graph,
    fetch,
    base.maxDepth ?? 8,
    resolveRemote,
  );
  if (local?.node(id) && !overlay.fetched && !overlay.warnings.length)
    return kind === "goal"
      ? local.resolveGoal(id, opts)
      : local.resolveProcedure(id, opts);
  const choices = { ...base.choices };
  for (const node of overlay.graph.nodes.values()) {
    const owner = node.id.includes(":") ? node.id.split(":")[0] : undefined;
    if (!owner) continue;
    for (const choice of getChoices(node)) {
      const selected = choices[`${owner}:${choice.id}`];
      if (
        selected !== undefined &&
        choices[`${node.id}:${choice.id}`] === undefined
      )
        choices[`${node.id}:${choice.id}`] = selected;
    }
  }
  const resolved = (kind === "goal" ? resolveGoal : resolveProcedure)(
    overlay.graph,
    id,
    {
      ...base,
      choices,
      availability: (n, tenant) =>
        n.id.includes(":")
          ? []
          : (base.availability ?? defaultAvailability)(n, tenant),
    },
  );
  const warn = (id: string) => {
    if (id.includes(":") && overlay.graph.nodes.get(id)?.availability)
      overlay.warnings.push(`availability of ${id} not checked`);
  };
  const warnAvailability = (plan: PlanStep[]) => {
    for (const step of plan) {
      if (step.kind === "check") {
        warn(step.state.id);
        continue;
      }
      warn(step.procedure.id);
      step.optional?.forEach((o) => warn(o.state.id));
      for (const item of step.steps)
        if (typeof item !== "string")
          item.options.forEach((o) => {
            [...o.capabilities, ...o.constraints].forEach((n) => warn(n.id));
            warnAvailability(o.plan);
          });
    }
  };
  resolved.alternatives.forEach((a) => {
    [...a.capabilities, ...a.constraints].forEach((n) => warn(n.id));
    warnAvailability(a.plan);
  });
  resolved.warnings = [...new Set([...resolved.warnings, ...overlay.warnings])];
  return spliceFragments(resolved, overlay.fragments);
}

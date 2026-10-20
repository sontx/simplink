import { choiceMarker, getChoices } from "./graph.js";
import { orderedItems, section } from "./markdown.js";
import type { ChoiceDef, EdgeKind, KBGraph, KBNode } from "./types.js";

/**
 * Caller plan, permissions, and product-specific context supplied to availability policies.
 */
export interface TenantContext {
  /** Product-specific values available to custom policies. */
  context?: Readonly<Record<string, unknown>>;
  /** Current tenant plan identifier. */
  plan?: string;
  /** Permissions granted to the current tenant or user. */
  permissions?: string[];
}

/**
 * Returns unavailability reasons, an empty array when available, or null when availability is unknown.
 */
export type AvailabilityPolicy = (
  node: KBNode,
  tenant?: TenantContext,
) => string[] | null;

/**
 * An alternative before ranking, with its zero-based declaration order.
 */
export type RankedCandidate = Omit<Alternative, "rank"> & { order: number };

/**
 * Sort comparator for alternatives; a negative value places the first candidate earlier.
 */
export type AlternativeComparator = (
  a: RankedCandidate,
  b: RankedCandidate,
) => number;

/**
 * State knowledge, branch selections, tenant context, and policy overrides for plan resolution.
 */
export interface ResolveOptions {
  /** Availability policy; defaults to defaultAvailability. */
  availability?: AvailabilityPolicy;
  /** Alternative comparator; defaults to defaultRank. */
  rank?: AlternativeComparator;
  /** Known state values. Missing = unknown → a check step is emitted. */
  states?: Record<string, boolean>;
  /** Used for availability and ranking. Omit → availability is null where gated. */
  tenant?: TenantContext;
  /** Pre-selected options, keyed by "choiceId" or "procedureId:choiceId" → option key. */
  choices?: Record<string, string>;
  /** Max procedure nesting depth (default 8). */
  maxDepth?: number;
}

/**
 * Compact node metadata embedded in a resolved plan.
 */
export interface NodeRef {
  /** Stable node or definition identifier. */
  id: string;
  /** Human-readable title. */
  title: string;
  /** Short description of the node. */
  summary: string;
}

/** All listed states must be false for the step to apply. */
export interface Condition {
  /** Required state reference. */
  state: string;
  /** Required state value for this condition. */
  is: false;
}

/**
 * A state check emitted when a required precondition is unknown.
 */
export interface CheckStep {
  /** Discriminator identifying the relationship or plan step. */
  kind: "check";
  /** Required state reference. */
  state: NodeRef;
  /** Instructions for checking the state. */
  how: string;
  /** Procedure to run when the state is false. */
  ifFalse: string | null;
  /** Human-readable condition for choosing this option. */
  when?: Condition[];
}

/**
 * Constraint metadata and its blocking or advisory severity.
 */
export interface ConstraintRef extends NodeRef {
  /** Severity of the diagnostic or constraint. */
  severity: "blocking" | "warning";
}

/**
 * Availability decision and the reasons an alternative or branch is unavailable.
 */
export interface AvailabilityInfo {
  /** null = gated by plan/permissions but no tenant given. */
  available: boolean | null;
  /** Reasons availability was denied; empty when available or unknown. */
  unavailableReasons: string[];
}

/**
 * A branch option with its resolved sub-plan and availability.
 */
export interface ChoiceOption extends AvailabilityInfo {
  /** Stable option key used to select this branch. */
  key: string;
  /** Human-readable condition for choosing this option. */
  when: string;
  /** Procedure referenced or executed by this entry. */
  procedure: NodeRef;
  /** Fully resolved sub-plan for this branch (checks, fixes, the option procedure). */
  plan: PlanStep[];
  /** Capabilities used by this plan. */
  capabilities: NodeRef[];
  /** Constraints applicable to this plan. */
  constraints: ConstraintRef[];
  /** Warnings associated with this result. */
  warnings: string[];
}

/**
 * A decision embedded in procedure steps, optionally narrowed to a selected branch.
 */
export interface ChooseStep {
  /** Discriminator identifying the relationship or plan step. */
  kind: "choose";
  /** Choice identifier within the procedure. */
  choice: string;
  /** Question presented when selecting a branch. */
  question: string;
  /** Set when the caller pre-selected an option; options then holds only that one. */
  selected?: string;
  /** Available branch options. */
  options: ChoiceOption[];
}

/** A step line, or a branching point at that position. */
export type StepItem = string | ChooseStep;

/**
 * An advisory state check and suggested fix that is never inserted into the required plan.
 */
export interface OptionalPrecondition {
  /** Required state reference. */
  state: NodeRef;
  /** Instructions for checking the state. */
  how: string;
  /** Suggested procedure if the state is not true. Never added to the plan. */
  fix: string | null;
}

/**
 * A procedure execution with steps, optional checks, and conditional applicability.
 */
export interface RunStep {
  /** Discriminator identifying the relationship or plan step. */
  kind: "run";
  /** Procedure referenced or executed by this entry. */
  procedure: NodeRef;
  /** Why this procedure appears in the plan. */
  reason: "main" | "requires" | "precondition";
  /** Ordered procedure instructions and embedded choices. */
  steps: StepItem[];
  /** Advisory preconditions that do not add required steps. */
  optional?: OptionalPrecondition[];
  /** Failure-handling guidance extracted from the procedure body. */
  failureHandling?: string;
  /** Human-readable condition for choosing this option. */
  when?: Condition[];
}

/**
 * A state check or procedure execution in a resolved plan.
 */
export type PlanStep = CheckStep | RunStep;

/**
 * One ranked procedure plan for achieving the requested goal.
 */
export interface Alternative extends AvailabilityInfo {
  /** One-based rank among alternatives. */
  rank: number;
  /** Procedure referenced or executed by this entry. */
  procedure: NodeRef;
  /** Whether the alternative procedure is deprecated. */
  deprecated: boolean;
  /** Ordered checks and procedure executions for this alternative or branch. */
  plan: PlanStep[];
  /** Capabilities used by this plan. */
  capabilities: NodeRef[];
  /** Constraints applicable to this plan. */
  constraints: ConstraintRef[];
  /** Preconditions skipped because the caller reported them true. */
  satisfiedStates: string[];
  /** Warnings associated with this result. */
  warnings: string[];
}

/**
 * Resolved goal or procedure with ranked alternatives and traversal warnings.
 */
export interface ResolvedGoal {
  /** "procedure" when produced by resolveProcedure (goal then holds the procedure). */
  subject: "goal" | "procedure";
  /** Requested goal metadata, or procedure metadata for a procedure result. */
  goal: NodeRef & { whenToUse: string[] };
  /** Procedure plans in rank order. */
  alternatives: Alternative[];
  /** Warnings associated with this result. */
  warnings: string[];
}

const ref = (n: KBNode): NodeRef => ({
  id: n.id,
  title: n.title,
  summary: n.summary,
});
const missingRef = (id: string): NodeRef => ({ id, title: id, summary: "" });

const targetIds = (n: KBNode, kind: string): string[] => {
  const v = n.data[kind];
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
};

/** Reasons a node is unavailable for the tenant; null when it is gated but no tenant was given. */
export function defaultAvailability(
  n: KBNode,
  tenant?: TenantContext,
): string[] | null {
  const plans = n.availability?.plans ?? [];
  const perms = n.availability?.permissions ?? [];
  if (!plans.length && !perms.length) return [];
  if (!tenant) return null;
  const reasons: string[] = [];
  if (plans.length && (!tenant.plan || !plans.includes(tenant.plan)))
    reasons.push(`${n.id} requires plan: ${plans.join(" | ")}`);
  const missing = perms.filter((p) => !(tenant.permissions ?? []).includes(p));
  if (missing.length)
    reasons.push(`${n.id} requires permission: ${missing.join(", ")}`);
  return reasons;
}

const availabilityRank = (a: boolean | null) =>
  a === true ? 0 : a === null ? 1 : 2;

type StateValue = boolean | "checked";

interface Summary extends AvailabilityInfo {
  plan: PlanStep[];
  capabilities: NodeRef[];
  constraints: ConstraintRef[];
  warnings: string[];
}

class PlanBuilder {
  readonly plan: PlanStep[] = [];
  readonly warnings: string[] = [];
  readonly satisfied = new Set<string>();
  readonly capabilities = new Map<string, KBNode>();
  readonly constraints = new Map<string, KBNode>();
  readonly runProcedures: KBNode[] = [];
  /** AvailabilityInfo of unselected choices (best option decides). */
  readonly choiceGates: { id: string; options: AvailabilityInfo[] }[] = [];
  private readonly runs = new Map<string, { step: RunStep; start: number }>();
  /** Procedures already run before this builder was forked. */
  private readonly preRun = new Set<string>();
  private readonly inProgress = new Set<string>();
  private readonly state = new Map<string, StateValue>();
  private readonly known: Map<string, boolean>;

  constructor(
    private readonly g: KBGraph,
    private readonly opts: ResolveOptions,
  ) {
    this.known = new Map(Object.entries(opts.states ?? {}));
    for (const [k, v] of this.known) this.state.set(k, v);
  }

  /** Child builder for a choice branch, starting from the current simulated state. */
  private fork(): PlanBuilder {
    const c = new PlanBuilder(this.g, this.opts);
    for (const [k, v] of this.state) c.state.set(k, v);
    for (const id of [...this.runs.keys(), ...this.preRun]) c.preRun.add(id);
    for (const id of this.inProgress) c.inProgress.add(id);
    return c;
  }

  private node(id: string, from: string): KBNode | undefined {
    const n = this.g.nodes.get(id);
    if (!n) this.warnings.push(`${from} references missing node "${id}"`);
    return n;
  }

  private targets(n: KBNode, kind: EdgeKind): KBNode[] {
    return targetIds(n, kind).flatMap((id) => this.node(id, n.id) ?? []);
  }

  private pickSatisfier(s: KBNode | undefined): KBNode | undefined {
    const sats = s ? this.targets(s, "satisfied_by") : [];
    return (
      sats.find(
        (x) =>
          (this.opts.availability ?? defaultAvailability)(x, this.opts.tenant)
            ?.length === 0,
      ) ?? sats[0]
    );
  }

  addProcedure(
    p: KBNode,
    reason: RunStep["reason"],
    when: Condition[],
    depth: number,
  ): void {
    if (this.preRun.has(p.id)) return;
    const existing = this.runs.get(p.id);
    if (existing) {
      if (when.length === 0 && existing.step.when) this.upgrade(existing);
      return;
    }
    if (this.inProgress.has(p.id)) {
      this.warnings.push(`cycle detected at ${p.id}; skipped`);
      return;
    }
    if (depth > (this.opts.maxDepth ?? 8)) {
      this.warnings.push(`max depth reached at ${p.id}; skipped`);
      return;
    }
    this.inProgress.add(p.id);
    const start = this.plan.length;

    for (const dep of this.targets(p, "requires"))
      this.addProcedure(dep, "requires", when, depth + 1);
    for (const stateId of targetIds(p, "preconditions"))
      this.precondition(p, stateId, when, depth);
    for (const cap of this.targets(p, "uses")) this.addCapability(cap);
    for (const c of this.targets(p, "constrained_by"))
      this.constraints.set(c.id, c);

    const optional = this.optionalPreconditions(p);
    const choices = new Map(getChoices(p).map((c) => [c.id, c]));
    const steps: StepItem[] = orderedItems(section(p.body, "Steps") ?? "").map(
      (text) => {
        const id = choiceMarker(text);
        const c = id ? choices.get(id) : undefined;
        return c ? this.choose(p, c, depth) : text;
      },
    );
    const failure = section(p.body, "Failure handling")?.trim();

    const step: RunStep = {
      kind: "run",
      procedure: ref(p),
      reason,
      steps,
      ...(optional.length ? { optional } : {}),
      ...(failure ? { failureHandling: failure } : {}),
      ...(when.length ? { when } : {}),
    };
    this.plan.push(step);
    this.runs.set(p.id, { step, start });
    this.runProcedures.push(p);
    if (when.length === 0)
      for (const s of targetIds(p, "produces")) this.state.set(s, true);

    this.inProgress.delete(p.id);
  }

  private precondition(
    p: KBNode,
    stateId: string,
    when: Condition[],
    depth: number,
  ): void {
    const v = this.state.get(stateId);
    if (v === true) {
      if (this.known.get(stateId) === true) this.satisfied.add(stateId);
      return;
    }
    if (v === "checked") return;

    const s = this.node(stateId, p.id);
    const sat = this.pickSatisfier(s);
    if (s && !sat)
      this.warnings.push(`${stateId} has no resolvable satisfied_by procedure`);

    if (v === false) {
      if (sat) this.addProcedure(sat, "precondition", when, depth + 1);
      this.state.set(stateId, true);
      return;
    }
    // Unknown: check, then fix conditionally.
    this.plan.push({
      kind: "check",
      state: s ? ref(s) : missingRef(stateId),
      how: typeof s?.data.check === "string" ? s.data.check : "",
      ifFalse: sat?.id ?? null,
      ...(when.length ? { when } : {}),
    });
    this.state.set(stateId, "checked");
    if (sat)
      this.addProcedure(
        sat,
        "precondition",
        [...when, { state: stateId, is: false }],
        depth + 1,
      );
  }

  /** Advisory only: never adds steps. Skipped when the state is already true. */
  private optionalPreconditions(p: KBNode): OptionalPrecondition[] {
    return targetIds(p, "optional_preconditions").flatMap((stateId) => {
      if (this.state.get(stateId) === true) {
        if (this.known.get(stateId) === true) this.satisfied.add(stateId);
        return [];
      }
      const s = this.node(stateId, p.id);
      return [
        {
          state: s ? ref(s) : missingRef(stateId),
          how: typeof s?.data.check === "string" ? s.data.check : "",
          fix: this.pickSatisfier(s)?.id ?? null,
        },
      ];
    });
  }

  private choose(p: KBNode, c: ChoiceDef, depth: number): ChooseStep {
    const picked =
      this.opts.choices?.[`${p.id}:${c.id}`] ?? this.opts.choices?.[c.id];
    let defs = c.options;
    let selected: string | undefined;
    if (picked !== undefined) {
      const hit = defs.find((o) => o.key === picked);
      if (hit) {
        defs = [hit];
        selected = picked;
      } else
        this.warnings.push(
          `choice "${c.id}" has no option "${picked}"; showing all`,
        );
    }

    const branches = defs.map((o) => {
      const child = this.fork();
      const proc = child.node(o.procedure, p.id);
      if (proc) child.addProcedure(proc, "main", [], depth + 1);
      return { o, proc, child };
    });
    const options: ChoiceOption[] = branches.map(({ o, proc, child }) => ({
      key: o.key,
      when: o.when,
      procedure: proc ? ref(proc) : missingRef(o.procedure),
      ...child.summary(),
    }));

    if (selected) {
      // Selected branch becomes part of this plan's reality.
      this.merge(branches[0].child, true);
    } else {
      this.choiceGates.push({ id: c.id, options });
      // States/procedures common to every branch hold after the choice.
      const children = branches.map((b) => b.child);
      for (const [k, v] of children[0]?.state ?? []) {
        if (v === true && children.every((ch) => ch.state.get(k) === true))
          this.state.set(k, true);
        else if (
          this.state.get(k) !== true &&
          children.every(
            (ch) => ch.state.get(k) !== undefined && ch.state.get(k) !== false,
          )
        )
          this.state.set(k, "checked");
      }
      for (const id of children[0]?.runs.keys() ?? [])
        if (children.every((ch) => ch.runs.has(id))) this.preRun.add(id);
    }
    return {
      kind: "choose",
      choice: c.id,
      question: c.question,
      ...(selected ? { selected } : {}),
      options,
    };
  }

  private merge(child: PlanBuilder, adoptState: boolean): void {
    for (const [k, v] of child.capabilities) this.capabilities.set(k, v);
    for (const [k, v] of child.constraints) this.constraints.set(k, v);
    this.runProcedures.push(...child.runProcedures);
    this.choiceGates.push(...child.choiceGates);
    this.warnings.push(...child.warnings);
    for (const s of child.satisfied) this.satisfied.add(s);
    for (const id of child.runs.keys()) this.preRun.add(id);
    if (adoptState) for (const [k, v] of child.state) this.state.set(k, v);
  }

  /** A conditional run is now needed unconditionally: drop its conditions from its whole expansion. */
  private upgrade(entry: { step: RunStep; start: number }): void {
    const drop = new Set((entry.step.when ?? []).map((c) => c.state));
    const end = this.plan.indexOf(entry.step);
    for (const step of this.plan.slice(entry.start, end + 1)) {
      if (!step.when) continue;
      const kept = step.when.filter((c) => !drop.has(c.state));
      if (kept.length) step.when = kept;
      else delete step.when;
    }
    for (const s of targetIds(
      this.g.nodes.get(entry.step.procedure.id)!,
      "produces",
    ))
      this.state.set(s, true);
  }

  private addCapability(cap: KBNode): void {
    if (this.capabilities.has(cap.id)) return;
    this.capabilities.set(cap.id, cap);
    for (const c of this.targets(cap, "constrained_by"))
      this.constraints.set(c.id, c);
    for (const dep of this.targets(cap, "requires")) this.addCapability(dep);
  }

  summary(): Summary {
    const gated = [...this.runProcedures, ...this.capabilities.values()].map(
      (n) =>
        (this.opts.availability ?? defaultAvailability)(n, this.opts.tenant),
    );
    // "X requires plan: e" + "Y requires plan: e" → "requires plan: e (X, Y)"
    const grouped = new Map<string, string[]>();
    const ungrouped: string[] = [];
    for (const r of gated.flatMap((r) => r ?? [])) {
      const match = /^(\S+) requires (.+)$/.exec(r);
      if (!match) {
        ungrouped.push(r);
        continue;
      }
      const [, id, need] = match;
      grouped.set(need, [...new Set([...(grouped.get(need) ?? []), id])]);
    }
    const reasons = [...grouped]
      .map(([need, ids]) => `requires ${need} (${ids.join(", ")})`)
      .concat(ungrouped);
    let available: boolean | null = reasons.length
      ? false
      : gated.some((r) => r === null)
        ? null
        : true;

    for (const cg of this.choiceGates) {
      const best = cg.options.reduce<boolean | null>(
        (acc, o) =>
          availabilityRank(o.available) < availabilityRank(acc)
            ? o.available
            : acc,
        false,
      );
      if (best === false) {
        available = false;
        reasons.push(`no available option for choice "${cg.id}"`);
      } else if (best === null && available === true) available = null;
    }

    const severityRank = (n: KBNode) =>
      n.data.severity === "blocking" ? 0 : 1;
    return {
      available,
      unavailableReasons: reasons,
      plan: this.plan,
      capabilities: [...this.capabilities.values()].map(ref),
      constraints: [...this.constraints.values()]
        .sort((a, b) => severityRank(a) - severityRank(b))
        .map((c) => ({
          ...ref(c),
          severity: c.data.severity === "blocking" ? "blocking" : "warning",
        })),
      warnings: this.warnings,
    };
  }

  toAlternative(main: KBNode): Omit<Alternative, "rank"> {
    return {
      procedure: ref(main),
      deprecated: [...this.runProcedures, ...this.capabilities.values()].some(
        (n) => n.status === "deprecated",
      ),
      satisfiedStates: [...this.satisfied],
      ...this.summary(),
    };
  }
}

const prepWork = (a: Omit<Alternative, "rank">) =>
  a.plan.filter((s) => s.kind === "check" || s.reason !== "main").length;

/**
 * Ranks by availability, active status, preparation work, plan length, then declaration order.
 */
export const defaultRank: AlternativeComparator = (a, b) =>
  availabilityRank(a.available) - availabilityRank(b.available) ||
  Number(a.deprecated) - Number(b.deprecated) ||
  prepWork(a) - prepWork(b) ||
  a.plan.length - b.plan.length ||
  a.order - b.order;

/**
 * Resolves a goal into ranked alternatives, one per goal procedure.
 * Ranking: availability → not deprecated → least prep work → fewest steps → declaration order.
 * @param g - Loaded graph snapshot.
 * @param goalId - Identifier of a goal node.
 * @param opts - Known states, branch selections, tenant context, and policy overrides.
 * @returns Ranked procedure alternatives and resolution warnings.
 * @throws If the identifier is absent or is not a goal.
 * Assumes the KB passed `simp-lint` (no dependency cycles); guards exist but only warn.
 */
export function resolveGoal(
  g: KBGraph,
  goalId: string,
  opts: ResolveOptions = {},
): ResolvedGoal {
  const goal = g.nodes.get(goalId);
  if (!goal || goal.type !== "goal")
    throw new Error(`"${goalId}" is not a goal node`);

  const warnings: string[] = [];
  const alts = targetIds(goal, "procedures").flatMap((id, order) => {
    const p = g.nodes.get(id);
    if (!p) {
      warnings.push(`${goalId} references missing procedure "${id}"`);
      return [];
    }
    const b = new PlanBuilder(g, opts);
    b.addProcedure(p, "main", [], 0);
    return [{ order, ...b.toAlternative(p) }];
  });

  alts.sort(opts.rank ?? defaultRank);

  return {
    subject: "goal",
    goal: { ...ref(goal), whenToUse: targetIds(goal, "when_to_use") },
    alternatives: alts.map(({ order, ...alt }, i) => ({ rank: i + 1, ...alt })),
    warnings,
  };
}

/**
 * Resolves a single procedure as a one-alternative result.
 * @param g - Loaded graph snapshot.
 * @param procedureId - Identifier of a procedure node.
 * @param opts - Known states, branch selections, tenant context, and policy overrides.
 * @returns The procedure plan with subject set to procedure.
 * @throws If the identifier is absent or is not a procedure.
 */
export function resolveProcedure(
  g: KBGraph,
  procedureId: string,
  opts: ResolveOptions = {},
): ResolvedGoal {
  const p = g.nodes.get(procedureId);
  if (!p || p.type !== "procedure")
    throw new Error(`"${procedureId}" is not a procedure node`);
  const b = new PlanBuilder(g, opts);
  b.addProcedure(p, "main", [], 0);
  return {
    subject: "procedure",
    goal: { ...ref(p), whenToUse: [] },
    alternatives: [{ rank: 1, ...b.toAlternative(p) }],
    warnings: [],
  };
}

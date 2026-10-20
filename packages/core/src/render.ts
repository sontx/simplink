import type { MaybePromise } from "./types.js";
import { estimateTokens } from "./markdown.js";
import type { AvailabilityInfo, ChooseStep, PlanStep, ResolvedGoal, StepItem } from "./resolve.js";

export interface RenderOptions {
  /** Approximate token budget (chars / 4). Default 2000. */
  tokenBudget?: number;
  /** Default renderer only. Priority-zero sections may exceed the token budget. */
  sections?: (defaults: RenderSection[], resolved: ResolvedGoal) => RenderSection[];
}

export interface RenderResult {
  text: string;
  tokens: number;
  /** Section names dropped to fit the budget. */
  omitted: string[];
}

export type PlanRenderer = (resolved: ResolvedGoal, opts: RenderOptions) => MaybePromise<RenderResult>;

export interface RenderSection {
  name: string;
  /** Lower = kept first. Priority 0 is always kept. */
  priority: number;
  text: string;
}

const availabilityLabel = (a: AvailabilityInfo) =>
  a.available === true ? "available" : a.available === null ? "unknown (no tenant context)" : `unavailable — ${a.unavailableReasons.join("; ")}`;

const whenLabel = (s: PlanStep) =>
  s.when?.length ? ` _(only if ${s.when.map((c) => `\`${c.state}\` is false`).join(" and ")})_` : "";

function renderChoose(c: ChooseStep, n: number, pad: string): string {
  const head = `${pad}${n}. **CHOOSE** \`${c.choice}\` — ${c.question}${c.selected ? ` _(selected: ${c.selected})_` : ""}`;
  const opts = c.options.map((o) => {
    const blocking = o.constraints.filter((k) => k.severity === "blocking").map((k) => `\`${k.id}\``);
    return [
      `${pad}   - **${o.key}**: ${o.when} — ${availabilityLabel(o)}`,
      blocking.length ? `${pad}     Blocking constraints: ${blocking.join(", ")}` : "",
      renderPlanSteps(o.plan, `${pad}     `),
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [head, ...opts].join("\n");
}

export function renderPlanSteps(plan: PlanStep[], pad = ""): string {
  const stepNo = new Map<string, number>();
  plan.forEach((s, i) => s.kind === "run" && stepNo.set(s.procedure.id, i + 1));
  return plan
    .map((s, i) => {
      if (s.kind === "check") {
        const ifFalse = s.ifFalse ? `run step ${stepNo.get(s.ifFalse) ?? "?"} (\`${s.ifFalse}\`)` : "no known fix — ask the user";
        return [`${pad}${i + 1}. **CHECK** \`${s.state.id}\` — ${s.state.title}${whenLabel(s)}`, s.how && `${pad}   How: ${s.how}`, `${pad}   If false: ${ifFalse}`]
          .filter(Boolean)
          .join("\n");
      }
      const sub = s.steps.map((t: StepItem, j) => (typeof t === "string" ? `${pad}   ${j + 1}. ${t}` : renderChoose(t, j + 1, `${pad}   `)));
      const optional = (s.optional ?? []).map(
        (o) => `${pad}   _Optional:_ \`${o.state.id}\` — ${o.state.title}${o.fix ? ` (if not true, consider \`${o.fix}\`)` : ""}`,
      );
      return [`${pad}${i + 1}. **RUN** \`${s.procedure.id}\` — ${s.procedure.title}${whenLabel(s)}`, ...sub, ...optional].join("\n");
    })
    .join("\n");
}

/** Renders a resolved goal as Markdown for LLM context, trimming low-priority sections to fit the budget. */
export function buildRenderSections(r: ResolvedGoal): RenderSection[] {
  const [best, ...others] = r.alternatives;
  const sections: RenderSection[] = [];
  const add = (name: string, priority: number, text: string) => text && sections.push({ name, priority, text });

  add("goal", 0, `# ${r.subject === "procedure" ? "Procedure" : "Goal"}: ${r.goal.title} (\`${r.goal.id}\`)\n${r.goal.summary}`);

  if (!best) {
    add("plan", 0, "No resolvable procedure for this goal.");
  } else {
    const satisfied = best.satisfiedStates.length ? `\nAlready satisfied: ${best.satisfiedStates.map((s) => `\`${s}\``).join(", ")}` : "";
    add(
      "plan",
      0,
      `## ${r.subject === "procedure" ? "Plan" : "Recommended"}: ${best.procedure.title} (\`${best.procedure.id}\`)\nAvailability: ${availabilityLabel(best)}${satisfied}\n\n### Plan\n${renderPlanSteps(best.plan)}`,
    );
    // Blocking constraints are never trimmed.
    add("constraints", best.constraints.some((c) => c.severity === "blocking") ? 0 : 1, best.constraints.length ? `## Constraints\n${best.constraints.map((c) => `- [${c.severity}] ${c.title} (\`${c.id}\`): ${c.summary}`).join("\n")}` : "");
    add(
      "alternatives",
      2,
      others.length
        ? `## Alternatives\n${others.map((a) => `${a.rank}. ${a.procedure.title} (\`${a.procedure.id}\`) — ${availabilityLabel(a)}; ${a.plan.length} step(s)`).join("\n")}`
        : "",
    );
    add("warnings", 2, [...r.warnings, ...best.warnings].length ? `## Warnings\n${[...r.warnings, ...best.warnings].map((w) => `- ${w}`).join("\n")}` : "");
    add("capabilities", 3, best.capabilities.length ? `## Capabilities used\n${best.capabilities.map((c) => `- ${c.title} (\`${c.id}\`): ${c.summary}`).join("\n")}` : "");
    const failures = best.plan.filter((s) => s.kind === "run" && s.failureHandling);
    add(
      "failure-handling",
      4,
      failures.length ? `## Failure handling\n${failures.map((s) => s.kind === "run" && `### ${s.procedure.title}\n${s.failureHandling}`).join("\n\n")}` : "",
    );
  }

  return sections;
}

/** Priority-zero content is always retained, even when it exceeds budget. */
export function fitSections(sections: RenderSection[], budget: number): RenderResult {
  // Keep strictly by priority: stop at the first section that does not fit. Output keeps original order.
  const kept = new Set<RenderSection>();
  let used = 0;
  for (const s of [...sections].sort((a, b) => a.priority - b.priority)) {
    const cost = estimateTokens(s.text) + 1;
    if (s.priority > 0 && used + cost > budget) break;
    kept.add(s);
    used += cost;
  }
  const omitted = sections.filter((s) => !kept.has(s)).map((s) => s.name);
  let text = sections.filter((s) => kept.has(s)).map((s) => s.text).join("\n\n");
  if (omitted.length) text += `\n\n_Omitted for budget: ${omitted.join(", ")}. Use getNode(id) for details._`;
  return { text, tokens: estimateTokens(text), omitted };
}

export function renderResolvedGoal(r: ResolvedGoal, opts: RenderOptions = {}): RenderResult {
  const defaults = buildRenderSections(r);
  return fitSections(opts.sections ? opts.sections(defaults, r) : defaults, opts.tokenBudget ?? 2000);
}

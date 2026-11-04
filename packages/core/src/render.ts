import type { MaybePromise } from "./types.js";
import { estimateTokens } from "./markdown.js";
import {
  en,
  messagesFor,
  translateDiagnostic,
  type LocaleOptions,
  type Messages,
} from "./i18n/index.js";
import type {
  AvailabilityInfo,
  ChooseStep,
  PlanStep,
  ResolvedGoal,
  StepItem,
} from "./resolve.js";

/**
 * Token budget, section customization, and output language for plan rendering.
 */
export interface RenderOptions extends LocaleOptions {
  /** Approximate token budget (chars / 4). Default 2000. */
  tokenBudget?: number;
  /** Default renderer only. Priority-zero sections may exceed the token budget. */
  sections?: (
    defaults: RenderSection[],
    resolved: ResolvedGoal,
  ) => RenderSection[];
}

/**
 * Rendered plan text, estimated token count, and omitted section names.
 */
export interface RenderResult {
  /** Rendered Markdown including any omission notice. */
  text: string;
  /** Approximate token count, calculated as the ceiling of character count divided by four. */
  tokens: number;
  /** Section names dropped to fit the budget. */
  omitted: string[];
}

/**
 * Custom synchronous or asynchronous renderer used by the KB facade.
 */
export type PlanRenderer = (
  resolved: ResolvedGoal,
  opts: RenderOptions,
) => MaybePromise<RenderResult>;

/**
 * A named Markdown section with a retention priority.
 */
export interface RenderSection {
  /** Section label used to report omissions. */
  name: string;
  /** Lower = kept first. Priority 0 is always kept. */
  priority: number;
  /** Markdown content of this section. */
  text: string;
}

const availabilityLabel = (a: AvailabilityInfo, m: Messages) =>
  a.available === true
    ? m.availability.available
    : a.available === null
      ? m.availability.unknown
      : m.availability.unavailable(
          a.unavailableReasons.map((r) => translateDiagnostic(r, m)),
        );

const defaultReference = (id: string) => `\`${id}\``;

const whenLabel = (
  s: PlanStep,
  formatReference: (id: string) => string,
  m: Messages,
) =>
  s.when?.length
    ? m.plan.onlyIf(s.when.map((c) => formatReference(c.state)))
    : "";

function renderChoose(
  c: ChooseStep,
  n: number,
  pad: string,
  formatReference: (id: string) => string,
  m: Messages,
): string {
  const head = `${pad}${n}. **${m.plan.choose}** \`${c.choice}\` — ${c.question}${c.selected ? m.plan.selected(c.selected) : ""}`;
  const opts = c.options.map((o) => {
    const blocking = o.constraints
      .filter((k) => k.severity === "blocking")
      .map((k) => formatReference(k.id));
    return [
      `${pad}   - **${o.key}**: ${o.when} — ${availabilityLabel(o, m)}`,
      blocking.length
        ? `${pad}     ${m.plan.blockingConstraints}: ${blocking.join(", ")}`
        : "",
      renderPlanSteps(o.plan, `${pad}     `, formatReference, m),
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [head, ...opts].join("\n");
}

/**
 * Renders checks, procedure runs, and nested choices as a Markdown ordered list.
 * @param plan - Ordered resolved steps.
 * @param pad - Indentation prefix; defaults to an empty string.
 * @param formatReference - Formats node identifiers; defaults to inline code.
 * @param m - Output language messages; defaults to English.
 * @returns Markdown for the supplied steps.
 */
export function renderPlanSteps(
  plan: PlanStep[],
  pad = "",
  formatReference: (id: string) => string = defaultReference,
  m: Messages = en,
): string {
  const stepNo = new Map<string, number>();
  plan.forEach((s, i) => s.kind === "run" && stepNo.set(s.procedure.id, i + 1));
  return plan
    .map((s, i) => {
      if (s.kind === "check") {
        const ifFalse = s.ifFalse
          ? m.plan.runStep(
              stepNo.get(s.ifFalse) ?? "?",
              formatReference(s.ifFalse),
            )
          : m.plan.noFix;
        return [
          `${pad}${i + 1}. **${m.plan.check}** ${formatReference(s.state.id)} — ${s.state.title}${whenLabel(s, formatReference, m)}`,
          s.how && `${pad}   ${m.plan.how}: ${s.how}`,
          `${pad}   ${m.plan.ifFalse}: ${ifFalse}`,
        ]
          .filter(Boolean)
          .join("\n");
      }
      const sub = s.steps.map((t: StepItem, j) =>
        typeof t === "string"
          ? `${pad}   ${j + 1}. ${t}`
          : renderChoose(t, j + 1, `${pad}   `, formatReference, m),
      );
      const optional = (s.optional ?? []).map(
        (o) =>
          `${pad}   _${m.plan.optional}:_ ${formatReference(o.state.id)} — ${o.state.title}${o.fix ? m.plan.considerFix(formatReference(o.fix)) : ""}`,
      );
      return [
        `${pad}${i + 1}. **${m.plan.run}** ${formatReference(s.procedure.id)} — ${s.procedure.title}${whenLabel(s, formatReference, m)}`,
        ...sub,
        ...optional,
      ].join("\n");
    })
    .join("\n");
}

/**
 * Builds the default plan sections for LLM context.
 * @param r - Resolution result.
 * @param m - Output language messages; defaults to English. Section names stay stable identifiers.
 * @returns Named sections with retention priorities.
 */
export function buildRenderSections(
  r: ResolvedGoal,
  m: Messages = en,
): RenderSection[] {
  const [best, ...others] = r.alternatives;
  const sections: RenderSection[] = [];
  const add = (name: string, priority: number, text: string) =>
    text && sections.push({ name, priority, text });
  const severity = (value: string) => m.severity[value] ?? value;

  add(
    "goal",
    0,
    `# ${r.subject === "procedure" ? m.plan.procedure : m.plan.goal}: ${r.goal.title} (\`${r.goal.id}\`)\n${r.goal.summary}`,
  );

  if (!best) {
    add("plan", 0, m.plan.noProcedure);
  } else {
    const satisfied = best.satisfiedStates.length
      ? `\n${m.plan.alreadySatisfied}: ${best.satisfiedStates.map((s) => `\`${s}\``).join(", ")}`
      : "";
    add(
      "plan",
      0,
      `## ${r.subject === "procedure" ? m.plan.plan : m.plan.recommended}: ${best.procedure.title} (\`${best.procedure.id}\`)\n${m.plan.availability}: ${availabilityLabel(best, m)}${satisfied}\n\n### ${m.plan.plan}\n${renderPlanSteps(best.plan, "", defaultReference, m)}`,
    );
    // Blocking constraints are never trimmed.
    add(
      "constraints",
      best.constraints.some((c) => c.severity === "blocking") ? 0 : 1,
      best.constraints.length
        ? `## ${m.plan.constraints}\n${best.constraints.map((c) => `- [${severity(c.severity)}] ${c.title} (\`${c.id}\`): ${c.summary}`).join("\n")}`
        : "",
    );
    add(
      "alternatives",
      2,
      others.length
        ? `## ${m.plan.alternatives}\n${others.map((a) => `${a.rank}. ${a.procedure.title} (\`${a.procedure.id}\`) — ${availabilityLabel(a, m)}; ${m.plan.stepCount(a.plan.length)}`).join("\n")}`
        : "",
    );
    const warnings = [...r.warnings, ...best.warnings];
    add(
      "warnings",
      2,
      warnings.length
        ? `## ${m.plan.warnings}\n${warnings.map((w) => `- ${translateDiagnostic(w, m)}`).join("\n")}`
        : "",
    );
    add(
      "capabilities",
      3,
      best.capabilities.length
        ? `## ${m.plan.capabilities}\n${best.capabilities.map((c) => `- ${c.title} (\`${c.id}\`): ${c.summary}`).join("\n")}`
        : "",
    );
    const failures = best.plan.filter(
      (s) => s.kind === "run" && s.failureHandling,
    );
    add(
      "failure-handling",
      4,
      failures.length
        ? `## ${m.plan.failureHandling}\n${failures.map((s) => s.kind === "run" && `### ${s.procedure.title}\n${s.failureHandling}`).join("\n\n")}`
        : "",
    );
  }

  return sections;
}

/**
 * Fits sections by increasing priority, preserving original order in the output.
 * Priority-zero content is always retained, even when it exceeds budget.
 * Stops at the first nonzero-priority section that does not fit.
 * @param sections - Named Markdown sections to consider.
 * @param budget - Approximate token limit; omission notices may increase the final count.
 * @param m - Output language messages for the omission notice; defaults to English.
 * @returns Combined text, estimated token count, and omitted section names.
 */
export function fitSections(
  sections: RenderSection[],
  budget: number,
  m: Messages = en,
): RenderResult {
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
  let text = sections
    .filter((s) => kept.has(s))
    .map((s) => s.text)
    .join("\n\n");
  if (omitted.length) text += `\n\n${m.plan.omitted(omitted)}`;
  return { text, tokens: estimateTokens(text), omitted };
}

/**
 * Renders a resolved goal or procedure as Markdown within an approximate token budget.
 * @param r - Resolution result.
 * @param opts - Budget, section overrides, and output language; the budget defaults to 2000 and the language to English.
 * @returns Text, estimated tokens, and omitted section names. Priority-zero sections may exceed the budget.
 */
export function renderResolvedGoal(
  r: ResolvedGoal,
  opts: RenderOptions = {},
): RenderResult {
  const m = messagesFor(opts);
  const defaults = buildRenderSections(r, m);
  return fitSections(
    opts.sections ? opts.sections(defaults, r) : defaults,
    opts.tokenBudget ?? 2000,
    m,
  );
}

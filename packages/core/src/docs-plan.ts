import { en, translateDiagnostic, type Messages } from "./i18n/index.js";
import type { AvailabilityInfo, PlanStep } from "./resolve.js";

export const docAvailability = (
  a: AvailabilityInfo,
  m: Messages = en,
): string =>
  a.available === true
    ? m.availability.available
    : a.available === null
      ? m.availability.docsUnknown
      : m.availability.unavailable(
          a.unavailableReasons.map((r) => translateDiagnostic(r, m)),
        );

/** Reader-facing steps; generated references are formatted separately from authored prose. */
export function renderDocPlan(
  plan: PlanStep[],
  link: (id: string) => string,
  pad = "",
  m: Messages = en,
): string {
  const severity = (value: string) => m.severity[value] ?? value;
  return plan
    .map((s, i) => {
      const when = s.when?.length
        ? m.docPlan.onlyIf(s.when.map((c) => link(c.state)))
        : "";
      if (s.kind === "check")
        return [
          `${pad}${i + 1}. ${m.docPlan.check(link(s.state.id), when)}`,
          s.how && `${pad}   ${s.how}`,
          `${pad}   ${m.docPlan.ifNotSatisfied(s.ifFalse ? m.docPlan.followFix(link(s.ifFalse)) : m.docPlan.noFix)}`,
        ]
          .filter(Boolean)
          .join("\n");
      const steps = s.steps.map((step, j) => {
        if (typeof step === "string") return `${pad}   ${j + 1}. ${step}`;
        return [
          `${pad}   ${j + 1}. ${step.question}${step.selected ? m.docPlan.selected(step.selected) : ""}`,
          ...step.options.map((o) =>
            [
              `${pad}      - **${o.key}**: ${o.when} — ${link(o.procedure.id)}; ${docAvailability(o, m)}`,
              ...o.constraints.map(
                (c) =>
                  `${pad}        - [${severity(c.severity)}] ${link(c.id)}: ${c.summary}`,
              ),
              renderDocPlan(o.plan, link, `${pad}        `, m),
            ]
              .filter(Boolean)
              .join("\n"),
          ),
        ].join("\n");
      });
      return [
        `${pad}${i + 1}. ${link(s.procedure.id)}${when}`,
        ...steps,
        ...(s.optional ?? []).map(
          (o) =>
            `${pad}   ${m.docPlan.optional}: ${link(o.state.id)}${o.how ? ` — ${o.how}` : ""}${o.fix ? m.docPlan.considerFix(link(o.fix)) : ""}`,
        ),
      ].join("\n");
    })
    .join("\n");
}

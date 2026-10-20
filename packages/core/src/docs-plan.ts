import type { AvailabilityInfo, PlanStep } from "./resolve.js";

export const docAvailability = (a: AvailabilityInfo): string =>
  a.available === true
    ? "available"
    : a.available === null
      ? "check plan and permission requirements"
      : `unavailable — ${a.unavailableReasons.join("; ")}`;

/** Reader-facing steps; generated references are formatted separately from authored prose. */
export function renderDocPlan(
  plan: PlanStep[],
  link: (id: string) => string,
  pad = "",
): string {
  return plan
    .map((s, i) => {
      const when = s.when?.length
        ? ` — only if ${s.when.map((c) => `${link(c.state)} is not satisfied`).join(" and ")}`
        : "";
      if (s.kind === "check")
        return [
          `${pad}${i + 1}. Check ${link(s.state.id)}${when}.`,
          s.how && `${pad}   ${s.how}`,
          `${pad}   If not satisfied: ${s.ifFalse ? `follow ${link(s.ifFalse)} below.` : "ask for help; no resolution is documented."}`,
        ]
          .filter(Boolean)
          .join("\n");
      const steps = s.steps.map((step, j) => {
        if (typeof step === "string") return `${pad}   ${j + 1}. ${step}`;
        return [
          `${pad}   ${j + 1}. ${step.question}${step.selected ? ` (selected: ${step.selected})` : ""}`,
          ...step.options.map((o) =>
            [
              `${pad}      - **${o.key}**: ${o.when} — ${link(o.procedure.id)}; ${docAvailability(o)}`,
              ...o.constraints.map(
                (c) =>
                  `${pad}        - [${c.severity}] ${link(c.id)}: ${c.summary}`,
              ),
              renderDocPlan(o.plan, link, `${pad}        `),
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
            `${pad}   Optional: ${link(o.state.id)}${o.how ? ` — ${o.how}` : ""}${o.fix ? ` If not satisfied, consider ${link(o.fix)}.` : ""}`,
        ),
      ].join("\n");
    })
    .join("\n");
}

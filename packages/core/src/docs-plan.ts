import { en, translateDiagnostic, type Messages } from "./i18n/index.js";
import type { AvailabilityInfo, PlanStep } from "./resolve.js";
import type { NodeImage } from "./types.js";

/** Markdown for one image of the node `owner`; "" leaves it out. */
export type DocImage = (owner: string, img: NodeImage) => string;

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
  image: DocImage = () => "",
): string {
  const severity = (value: string) => m.severity[value] ?? value;
  const images = (
    owner: string,
    list: NodeImage[] | undefined,
    indent: string,
    step?: number,
  ) =>
    (list ?? [])
      .filter((img) => img.step === step)
      .map((img) => image(owner, img))
      .filter(Boolean)
      .map((md) => `${indent}${md}`);
  return plan
    .map((s, i) => {
      const when = s.when?.length
        ? m.docPlan.onlyIf(s.when.map((c) => link(c.state)))
        : "";
      if (s.kind === "check")
        return [
          `${pad}${i + 1}. ${m.docPlan.check(link(s.state.id), when)}`,
          s.how && `${pad}   ${s.how}`,
          ...images(s.state.id, s.images, `${pad}   `),
          `${pad}   ${m.docPlan.ifNotSatisfied(s.ifFalse ? m.docPlan.followFix(link(s.ifFalse)) : m.docPlan.noFix)}`,
        ]
          .filter(Boolean)
          .join("\n");
      const steps = s.steps.map((step, j) => {
        const shots = images(s.procedure.id, s.images, `${pad}      `, j + 1);
        if (typeof step === "string")
          return [`${pad}   ${j + 1}. ${step}`, ...shots].join("\n");
        return [
          `${pad}   ${j + 1}. ${step.question}${step.selected ? m.docPlan.selected(step.selected) : ""}`,
          ...step.options.map((o) =>
            [
              `${pad}      - **${o.key}**: ${o.when} — ${link(o.procedure.id)}; ${docAvailability(o, m)}`,
              ...o.constraints.map(
                (c) =>
                  `${pad}        - [${severity(c.severity)}] ${link(c.id)}: ${c.summary}`,
              ),
              renderDocPlan(o.plan, link, `${pad}        `, m, image),
            ]
              .filter(Boolean)
              .join("\n"),
          ),
          ...shots,
        ].join("\n");
      });
      return [
        `${pad}${i + 1}. ${link(s.procedure.id)}${when}`,
        ...images(s.procedure.id, s.images, `${pad}   `),
        ...steps,
        ...(s.optional ?? []).map(
          (o) =>
            `${pad}   ${m.docPlan.optional}: ${link(o.state.id)}${o.how ? ` — ${o.how}` : ""}${o.fix ? m.docPlan.considerFix(link(o.fix)) : ""}`,
        ),
      ].join("\n");
    })
    .join("\n");
}

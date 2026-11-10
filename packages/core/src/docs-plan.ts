import { en, readerDiagnostic, type Messages } from "./i18n/index.js";
import type { AvailabilityInfo, PlanStep } from "./resolve.js";
import type { NodeImage } from "./types.js";

/** Markdown for one image of the node `owner`; "" leaves it out. */
export type DocImage = (owner: string, img: NodeImage) => string;

/**
 * Reader-facing availability note, or "" when nothing restricts the plan, since
 * "available" on every guide tells the reader nothing.
 */
export const docAvailability = (
  a: AvailabilityInfo,
  m: Messages,
  link: (id: string) => string,
): string =>
  a.available === true
    ? ""
    : a.available === null
      ? m.availability.docsUnknown
      : m.availability.unavailable(
          a.unavailableReasons.map((r) => readerDiagnostic(r, m, link)),
        );

/** Reader-facing label for a constraint severity, falling back to the severity label, then the raw value. */
export const requirementLabel = (value: string, m: Messages = en): string =>
  m.docs.requirementLabels[value] ?? m.severity[value] ?? value;

const suffix = (note: string) => (note ? `; ${note}` : "");

/** Reader-facing steps; generated references are formatted separately from authored prose. */
export function renderDocPlan(
  plan: PlanStep[],
  link: (id: string) => string,
  pad = "",
  m: Messages = en,
  image: DocImage = () => "",
): string {
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
              `${pad}      - **${o.key}**: ${o.when} — ${link(o.procedure.id)}${suffix(docAvailability(o, m, link))}`,
              ...o.constraints.map(
                (c) =>
                  `${pad}        - ${requirementLabel(c.severity, m)}: ${link(c.id)} — ${c.summary}`,
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

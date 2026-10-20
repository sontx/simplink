import path from "node:path";
import { getChoices } from "./graph.js";
import { siteGraph, siteIndexes } from "./docs-layout.js";
import { docAvailability, renderDocPlan } from "./docs-plan.js";
import {
  resolveGoal,
  type AvailabilityInfo,
  type PlanStep,
  type ResolveOptions,
} from "./resolve.js";
import { renderPlanSteps } from "./render.js";
import { EDGE_KINDS, type KBGraph, type ChoiceDef } from "./types.js";

export interface DocPage {
  path: string;
  content: string;
}

export interface DocsOptions extends ResolveOptions {
  /** Site is reader-facing; graph preserves the original one-page-per-node layout. */
  layout?: "site" | "graph";
}

const label = (text: string) => text.replace(/[\\[\]]/g, "\\$&");
const code = (text: string) => {
  const fence = "`".repeat(
    Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length)) + 1,
  );
  return `${fence} ${text} ${fence}`;
};

/** Transform prose only; fence delimiters and matching backtick runs stay literal. */
function proseLinks(
  text: string,
  link: (id: string, title?: string, fragment?: string) => string,
  choices: ChoiceDef[] = [],
): string {
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (i === 0 || text[i - 1] === "\n") {
      const opening = /^ {0,3}(`{3,}|~{3,})([^\n]*)(?:\n|$)/.exec(
        text.slice(i),
      );
      if (opening && !(opening[1][0] === "`" && opening[2].includes("`"))) {
        const end = new RegExp(
          `^ {0,3}${opening[1][0]}{${opening[1].length},}[ \\t]*\\r?$`,
          "gm",
        );
        end.lastIndex = i + opening[0].length;
        const closing = end.exec(text);
        const until = closing ? closing.index + closing[0].length : text.length;
        result += text.slice(i, until);
        i = until;
        continue;
      }
      const marker =
        /^([ \t]*\d+\.[ \t]+)`?choice:([a-z0-9-]+)`?[ \t]*(\r?\n|$)/.exec(
          text.slice(i),
        );
      const choice = marker && choices.find((c) => c.id === marker[2]);
      if (marker && choice) {
        result += `${marker[1]}${proseLinks(choice.question, link)}${marker[3]}`;
        i += marker[0].length;
        continue;
      }
    }
    if (text[i] === "`") {
      const run = /^`+/.exec(text.slice(i))![0];
      const runs = /`+/g;
      runs.lastIndex = i + run.length;
      let closing: RegExpExecArray | null;
      while ((closing = runs.exec(text)) && closing[0].length !== run.length) {
        /* find matching delimiter */
      }
      const until = closing ? closing.index + run.length : i + run.length;
      result += text.slice(i, until);
      i = until;
      continue;
    }
    const wiki = /^\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/.exec(
      text.slice(i),
    );
    if (wiki) {
      result += link(wiki[1].trim(), wiki[3], wiki[2]);
      i += wiki[0].length;
    } else {
      result += text[i++];
    }
  }
  return result;
}

const edgeLabels = {
  procedures: "Procedures",
  requires: "Requires",
  preconditions: "Preconditions",
  optional_preconditions: "Optional preconditions",
  produces: "Produces",
  uses: "Uses",
  constrained_by: "Constrained by",
  satisfied_by: "Satisfied by",
  related: "Related",
  choice_option: "Choice options",
};

const siteEdgeLabels = {
  procedures: "Ways to do this",
  requires: "Preparation guides",
  preconditions: "Before you begin",
  optional_preconditions: "Optional preparation",
  produces: "Result",
  uses: "Features used",
  constrained_by: "Requirements",
  satisfied_by: "How to resolve this",
  related: "See also",
  choice_option: "Available methods",
};

function choiceWarnings(plan: PlanStep[]): string[] {
  return plan.flatMap((s) =>
    s.kind === "run"
      ? s.steps.flatMap((step) =>
          typeof step === "string"
            ? []
            : step.options.flatMap((option) => [
                ...option.warnings.map(
                  (warning) => `${step.choice}/${option.key}: ${warning}`,
                ),
                ...choiceWarnings(option.plan),
              ]),
        )
      : [],
  );
}

/** Export a lint-clean graph as standalone Markdown pages, without modifying it. */
export function exportDocs(graph: KBGraph, opts: DocsOptions = {}): DocPage[] {
  if (
    opts.layout !== undefined &&
    opts.layout !== "site" &&
    opts.layout !== "graph"
  )
    throw new Error("Invalid docs layout: expected site or graph");
  const site = opts.layout !== "graph";
  const sourceGraph = graph;
  if (site) graph = siteGraph(graph);
  const pages = [...graph.nodes.values()].map((node) => {
    const link = (id: string, title?: string, fragment?: string): string => {
      const target = graph.nodes.get(id);
      if (!target) return id.includes("`") ? code(id) : `\`${id}\``;
      const relative = path.posix.relative(
        path.posix.dirname(node.path),
        target.path,
      );
      const url = encodeURI(relative).replace(/[()]/g, (c) =>
        c === "(" ? "%28" : "%29",
      );
      return `[${label(title ?? target.title)}](${url}${fragment === undefined ? "" : `#${fragment}`})`;
    };
    const prose = (text: string) => proseLinks(text, link);
    const sections = [
      `---\ntitle: ${JSON.stringify(node.title)}\ndescription: ${JSON.stringify(node.summary)}\n---`,
      `# ${node.title}`,
      prose(node.summary),
    ];
    if (node.status === "deprecated") sections.push("> Deprecated.");
    const field = (name: string, value: unknown) => {
      if (Array.isArray(value) && value.length)
        sections.push(`**${name}:** ${prose(value.join("; "))}`);
      else if (typeof value === "string" && value)
        sections.push(`**${name}:** ${prose(value)}`);
    };
    field("When to use", node.data.when_to_use);
    field("Check", node.data.check);
    field(site ? "Requirement level" : "Severity", node.data.severity);
    field(site ? "Available on plans" : "Plans", node.availability?.plans);
    field(
      site ? "Required permissions" : "Permissions",
      node.availability?.permissions,
    );
    if (!site) {
      field("Aliases", node.aliases);
      field("Tags", node.tags);
    }
    if (node.body)
      sections.push(proseLinks(node.body, link, site ? getChoices(node) : []));
    const choices = getChoices(node);
    if (choices.length)
      sections.push(
        `## ${site ? "Choose a method" : "Choices"}\n\n${choices
          .map(
            (c) =>
              `${site ? `### ${prose(c.question)}` : `### ${c.id}\n\n${prose(c.question)}`}\n\n${c.options.map((o) => `- **${o.key}**: ${prose(o.when ?? "")} — ${link(o.procedure)}`).join("\n")}`,
          )
          .join("\n\n")}`,
      );
    const item = (id: string) => {
      const target = graph.nodes.get(id);
      return `- ${link(id)}${target?.summary ? ` — ${prose(target.summary)}` : ""}`;
    };
    for (const kind of EDGE_KINDS) {
      const edges = (graph.out.get(node.id) ?? []).filter(
        (e) => e.source === "frontmatter" && e.kind === kind,
      );
      if (edges.length)
        sections.push(
          `## ${(site ? siteEdgeLabels : edgeLabels)[kind]}\n\n${edges.map((e) => item(e.to)).join("\n")}`,
        );
    }
    const incoming = [
      ...new Set((graph.in.get(node.id) ?? []).map((e) => e.from)),
    ];
    if (incoming.length)
      sections.push(
        `## ${site ? "Used in these guides" : "Referenced by"}\n\n${incoming.map(item).join("\n")}`,
      );
    if (node.type === "goal") {
      const resolved = resolveGoal(sourceGraph, node.id, opts);
      const [best, ...others] = resolved.alternatives;
      const availability = (a: AvailabilityInfo) =>
        site
          ? docAvailability(a)
          : a.available === true
            ? "available"
            : a.available === null
              ? "unknown (no tenant context)"
              : `unavailable — ${a.unavailableReasons.join("; ")}`;
      const warnings = [
        ...resolved.warnings,
        ...(best?.warnings ?? []),
        ...choiceWarnings(best?.plan ?? []),
      ];
      if (!best)
        sections.push(
          `${site ? "## Steps" : "## Recommended plan"}\n\nNo resolvable procedure for this goal.`,
        );
      else {
        sections.push(
          `${site ? "## Steps" : "## Recommended plan"}\n\n${link(best.procedure.id)}\n\nAvailability: ${prose(availability(best))}`,
        );
        if (best.deprecated)
          sections.push("> Deprecated dependency in this recommendation.");
        if (best.satisfiedStates.length)
          sections.push(
            `Already satisfied: ${best.satisfiedStates.map((id) => link(id)).join(", ")}`,
          );
        sections.push(
          prose(
            site
              ? renderDocPlan(best.plan, (id) => link(id))
              : renderPlanSteps(best.plan, "", (id) => link(id)),
          ),
        );
        if (best.constraints.length)
          sections.push(
            `## ${site ? "Requirements" : "Constraints"}\n\n${best.constraints.map((c) => `- [${c.severity}] ${link(c.id)} — ${prose(c.summary)}`).join("\n")}`,
          );
        const failures = (plan: PlanStep[]): string[] =>
          plan.flatMap((s) =>
            s.kind === "run"
              ? [
                  ...(s.failureHandling
                    ? [
                        `### ${link(s.procedure.id)}\n\n${prose(s.failureHandling)}`,
                      ]
                    : []),
                  ...s.steps.flatMap((step) =>
                    typeof step === "string"
                      ? []
                      : step.options.flatMap((o) => failures(o.plan)),
                  ),
                ]
              : [],
          );
        const handling = failures(best.plan);
        if (handling.length)
          sections.push(
            `## ${site ? "If something goes wrong" : "Failure handling"}\n\n${handling.join("\n\n")}`,
          );
      }
      if (others.length)
        sections.push(
          `## Alternatives\n\n${others.map((a) => `- ${link(a.procedure.id)} — ${prose(availability(a))}${a.deprecated ? "; deprecated dependency" : ""}`).join("\n")}`,
        );
      if (warnings.length)
        sections.push(
          `## Warnings\n\n${[...new Set(warnings)].map((w) => `- ${prose(w)}`).join("\n")}`,
        );
    }
    return {
      path: node.path,
      content: sections.filter(Boolean).join("\n\n") + "\n",
    };
  });
  return site ? [...siteIndexes(graph), ...pages] : pages;
}

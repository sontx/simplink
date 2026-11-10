import { parseSimpUri } from "./links.js";
import { parseRef, localize, idToPath } from "./ids.js";
import { simpDoc } from "./simp-doc.js";
import * as path from "./posix-path.js";
import { getChoices } from "./graph.js";
import { siteGraph, siteIndexes } from "./docs-layout.js";
import {
  docAvailability,
  renderDocPlan,
  requirementLabel,
} from "./docs-plan.js";
import {
  resolveGoal,
  type AvailabilityInfo,
  type Condition,
  type ConstraintRef,
  type PlanStep,
  type ResolveOptions,
} from "./resolve.js";
import { renderPlanSteps } from "./render.js";
import { resolveAsset } from "./assets.js";
import {
  EDGE_KINDS,
  type KBGraph,
  type ChoiceDef,
  type NodeImage,
} from "./types.js";
import {
  messagesFor,
  translateDiagnostic,
  type LocaleOptions,
  type Messages,
} from "./i18n/index.js";

/**
 * An exported Markdown page returned in memory for the caller to persist.
 */
export interface DocPage {
  /** Relative output path of the generated Markdown page. */
  path: string;
  /** Full generated Markdown content. */
  content: string;
}

/**
 * Documentation layout, output language, and plan resolution options.
 */
export interface DocsOptions extends ResolveOptions, LocaleOptions {
  /** Site is reader-facing; graph preserves the original one-page-per-node layout. */
  layout?: "site" | "graph";
  /** Renders a link to another simp's node; return `undefined` to use the default `docs_url` link or labeled text. */
  remoteLink?: (
    ref: string,
    label: string,
    fragment?: string,
  ) => string | undefined;
}

const label = (text: string) => text.replace(/[\\[\]]/g, "\\$&");
const code = (text: string) => {
  const fence = "`".repeat(
    Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length)) + 1,
  );
  return `${fence} ${text} ${fence}`;
};

/**
 * Localizes the format-defined procedure section headings (`## Steps`, `## Failure handling`)
 * that authors always write in English; headings inside fenced code stay literal.
 */
function localizeProcedureHeadings(body: string, t: Messages["docs"]): string {
  const headings: Record<string, string> = {
    steps: t.steps,
    "failure handling": t.failureHandling,
  };
  let fence: string | null = null;
  return body
    .split("\n")
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (fence === null) fence = marker;
        else if (marker[0] === fence[0] && marker.length >= fence.length)
          fence = null;
        return line;
      }
      if (fence !== null) return line;
      const m = /^(##\s+)(.+?)(\s*)$/.exec(line);
      const localized = m && headings[m[2].toLowerCase()];
      return localized ? `${m[1]}${localized}${m[3]}` : line;
    })
    .join("\n");
}

/** Transform prose only; fence delimiters and matching backtick runs stay literal. */
function proseLinks(
  text: string,
  link: (id: string, title?: string, fragment?: string) => string,
  choices: ChoiceDef[] = [],
  asset?: (url: string) => string | undefined,
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
    const image =
      asset &&
      /^!\[([^\]\n]*)\]\(([^\s)]+)((?:\s+"[^"\n]*")?)\)/.exec(text.slice(i));
    const moved = image && asset!(image[2]);
    if (image && moved !== undefined) {
      result += `![${image[1]}](${moved}${image[3]})`;
      i += image[0].length;
      continue;
    }
    const markdown = /^\[([^\]\n]*)\]\((simp:\/\/[^\s)]*)\)/.exec(
      text.slice(i),
    );
    const simpLink = markdown && parseSimpUri(markdown[2]);
    if (markdown && simpLink) {
      result += link(simpLink.ref, markdown[1], simpLink.fragment);
      i += markdown[0].length;
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

function choiceWarnings(plan: PlanStep[], m: Messages): string[] {
  return plan.flatMap((s) =>
    s.kind === "run"
      ? s.steps.flatMap((step) =>
          typeof step === "string"
            ? []
            : step.options.flatMap((option) => [
                ...option.warnings.map(
                  (warning) =>
                    `${step.choice}/${option.key}: ${translateDiagnostic(warning, m)}`,
                ),
                ...choiceWarnings(option.plan, m),
              ]),
        )
      : [],
  );
}

/**
 * Generates documentation pages in memory without writing files.
 * Generated headings, plan wording, and the format-defined procedure headings (`## Steps`, `## Failure handling`) follow the output language; other authored content is unchanged.
 * @param graph - Graph snapshot to document.
 * @param opts - Layout, language, and plan resolution options; layout defaults to site and language to English.
 * @returns Markdown pages with relative output paths.
 */
export function exportDocs(graph: KBGraph, opts: DocsOptions = {}): DocPage[] {
  if (
    opts.layout !== undefined &&
    opts.layout !== "site" &&
    opts.layout !== "graph"
  )
    throw new Error("Invalid docs layout: expected site or graph");
  const site = opts.layout !== "graph";
  const m = messagesFor(opts);
  const t = m.docs;
  const severity = (value: string) => m.severity[value] ?? value;
  const requirement = (value: string) => requirementLabel(value, m);
  const capitalize = (text: string) =>
    text.charAt(0).toUpperCase() + text.slice(1);
  const sourceGraph = graph;
  if (site) graph = siteGraph(graph);
  const pages = [...graph.nodes.values()].map((node) => {
    // Images are copied beside the pages at their KB paths (see docAssets).
    const href = (target: string) =>
      path
        .relative(path.dirname(node.path), target)
        .split("/")
        // Per segment, so `#` and `?` in a file name are escaped rather than read as a fragment or query.
        .map((part) =>
          encodeURIComponent(part).replace(/[()]/g, (c) =>
            c === "(" ? "%28" : "%29",
          ),
        )
        .join("/");
    const sourcePath = sourceGraph.nodes.get(node.id)?.path ?? node.path;
    const asset = (url: string) => {
      const src = resolveAsset(sourcePath, url);
      return src === undefined ? undefined : href(src);
    };
    const imageMd = (img: NodeImage) =>
      `![${label(img.alt.replace(/\s+/g, " "))}](${href(img.src)})`;
    // Goal pages draw plan images (taken out of step text); remote nodes' images live in their own KB.
    const planImage = (owner: string, img: NodeImage) =>
      sourceGraph.nodes.has(owner) && !parseRef(owner).simp ? imageMd(img) : "";
    const link = (id: string, title?: string, fragment?: string): string => {
      id = localize(id, simpDoc(sourceGraph)?.name);
      const ref = parseRef(id);
      if (ref.simp) {
        const text = title ?? id;
        const custom = opts.remoteLink?.(id, text, fragment);
        if (custom !== undefined) return custom;
        const base = simpDoc(sourceGraph)?.peers.find(
          (p) => p.name === ref.simp,
        )?.docsUrl;
        const remotePath = idToPath(ref.id);
        if (base && remotePath)
          return `[${label(text)}](${base.replace(/\/+$/, "")}/${ref.id === "simp" ? "" : remotePath}${fragment === undefined ? "" : `#${fragment}`})`;
        return `${text} (${ref.simp})`;
      }
      const target = graph.nodes.get(id);
      if (!target) return id.includes("`") ? code(id) : `\`${id}\``;
      return `[${label(title ?? target.title)}](${href(target.path)}${fragment === undefined ? "" : `#${fragment}`})`;
    };
    const prose = (text: string) => proseLinks(text, link);
    if (site && node.type === "simp" && node.body.trim())
      return {
        path: node.path,
        content: proseLinks(node.body, link, [], asset).trim() + "\n",
      };
    const sections = [
      `---\ntitle: ${JSON.stringify(node.title)}\ndescription: ${JSON.stringify(node.summary)}\n---`,
      `# ${node.title}`,
      prose(node.summary),
    ];
    if (node.status === "deprecated") sections.push(`> ${t.deprecated}`);
    const field = (name: string, value: unknown) => {
      if (Array.isArray(value) && value.length)
        sections.push(`**${name}:** ${prose(value.join("; "))}`);
      else if (typeof value === "string" && value)
        sections.push(`**${name}:** ${prose(value)}`);
    };
    field(t.whenToUse, node.data.when_to_use);
    field(t.check, node.data.check);
    field(
      site ? t.requirementLevel : t.severity,
      typeof node.data.severity === "string"
        ? (site ? requirement : severity)(node.data.severity)
        : node.data.severity,
    );
    field(site ? t.availableOnPlans : t.plans, node.availability?.plans);
    field(
      site ? t.requiredPermissions : t.permissions,
      node.availability?.permissions,
    );
    if (!site) {
      field(t.aliases, node.aliases);
      field(t.tags, node.tags);
    }
    if (node.body)
      sections.push(
        proseLinks(
          node.type === "procedure"
            ? localizeProcedureHeadings(node.body, t)
            : node.body,
          link,
          site ? getChoices(node) : [],
          asset,
        ),
      );
    const choices = getChoices(node);
    if (choices.length)
      sections.push(
        `## ${site ? t.chooseMethod : t.choices}\n\n${choices
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
          `## ${(site ? t.siteEdges : t.edges)[kind] ?? kind}\n\n${edges.map((e) => item(e.to)).join("\n")}`,
        );
    }
    const incoming = [
      ...new Set((graph.in.get(node.id) ?? []).map((e) => e.from)),
    ];
    if (incoming.length)
      sections.push(
        `## ${site ? t.usedInGuides : t.referencedBy}\n\n${incoming.map(item).join("\n")}`,
      );
    if (node.type === "goal") {
      const resolved = resolveGoal(sourceGraph, node.id, opts);
      const [best, ...others] = resolved.alternatives;
      const availability = (a: AvailabilityInfo) =>
        site
          ? docAvailability(a, m)
          : a.available === true
            ? m.availability.available
            : a.available === null
              ? m.availability.unknown
              : m.availability.unavailable(
                  a.unavailableReasons.map((r) => translateDiagnostic(r, m)),
                );
      const warnings = [...resolved.warnings, ...(best?.warnings ?? [])]
        .map((w) => translateDiagnostic(w, m))
        .concat(choiceWarnings(best?.plan ?? [], m));
      const stepsHeading = `## ${site ? t.steps : t.recommendedPlan}`;
      if (!best) sections.push(`${stepsHeading}\n\n${t.noProcedure}`);
      else {
        // Site guides group constraints by what the reader must do about them:
        // blocking ones before the steps, warnings after. Graph docs keep one list.
        // A blocking constraint reached only through a conditional step carries
        // that step's condition; one reached only through a choice option is
        // left to the option, which lists it inline.
        const conditions = constraintConditions(sourceGraph, best.plan);
        const constraintItem = (c: ConstraintRef, when: Condition[] = []) =>
          `- **${link(c.id)}**${when.length ? m.docPlan.onlyIf(when.map((x) => link(x.state))) : ""}\\\n  ${prose(c.summary)}`;
        const blocking = best.constraints.flatMap((c) => {
          const when = conditions.get(c.id);
          return c.severity === "blocking" && when
            ? [constraintItem(c, when)]
            : [];
        });
        const advisory = best.constraints.filter(
          (c) => c.severity !== "blocking",
        );
        if (site && blocking.length)
          sections.push(`## ${t.beforeYouStart}\n\n${blocking.join("\n")}`);
        sections.push(
          `${stepsHeading}\n\n${link(best.procedure.id)}\n\n${t.availability}: ${prose(availability(best))}`,
        );
        if (best.deprecated) sections.push(`> ${t.deprecatedDependency}`);
        if (best.satisfiedStates.length)
          sections.push(
            `${t.alreadySatisfied}: ${best.satisfiedStates.map((id) => link(id)).join(", ")}`,
          );
        sections.push(
          prose(
            site
              ? renderDocPlan(best.plan, (id) => link(id), "", m, planImage)
              : renderPlanSteps(best.plan, "", (id) => link(id), m),
          ),
        );
        if (site && advisory.length)
          sections.push(
            `## ${requirement("warning")}\n\n${advisory.map((c) => constraintItem(c)).join("\n")}`,
          );
        if (!site && best.constraints.length)
          sections.push(
            `## ${t.constraints}\n\n${best.constraints.map((c) => `- **${capitalize(severity(c.severity))}:** ${link(c.id)} — ${prose(c.summary)}`).join("\n")}`,
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
            `## ${site ? t.ifSomethingGoesWrong : t.failureHandling}\n\n${handling.join("\n\n")}`,
          );
      }
      if (others.length)
        sections.push(
          `## ${t.alternatives}\n\n${others.map((a) => `- ${link(a.procedure.id)} — ${prose(availability(a))}${a.deprecated ? `; ${t.deprecatedDependencySuffix}` : ""}`).join("\n")}`,
        );
      if (warnings.length)
        sections.push(
          `## ${t.warnings}\n\n${[...new Set(warnings)].map((w) => `- ${prose(w)}`).join("\n")}`,
        );
    }
    return {
      path: node.path,
      content: sections.filter(Boolean).join("\n\n") + "\n",
    };
  });
  return site
    ? [
        ...siteIndexes(
          graph,
          pages.find((page) => page.path === "index.md"),
          m,
        ),
        ...pages.filter((page) => page.path !== "index.md"),
      ]
    : pages;
}

/**
 * Conditions under which each constraint applies to a plan's top-level steps:
 * `[]` when an unconditional step needs it, otherwise the first conditional
 * step's conditions. Constraints reached only through choice options are absent.
 */
function constraintConditions(
  graph: KBGraph,
  plan: PlanStep[],
): Map<string, Condition[]> {
  const ids = (id: string, kind: string): string[] => {
    const v = graph.nodes.get(id)?.data[kind];
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === "string")
      : [];
  };
  const result = new Map<string, Condition[]>();
  for (const step of plan) {
    if (step.kind !== "run") continue;
    const when = step.when ?? [];
    const owners = new Set([step.procedure.id]);
    const addCapability = (id: string) => {
      if (owners.has(id)) return;
      owners.add(id);
      ids(id, "requires").forEach(addCapability);
    };
    ids(step.procedure.id, "uses").forEach(addCapability);
    for (const owner of owners)
      for (const c of ids(owner, "constrained_by")) {
        const seen = result.get(c);
        if (!seen || (seen.length && !when.length)) result.set(c, when);
      }
  }
  return result;
}

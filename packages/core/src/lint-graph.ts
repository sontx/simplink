import { parseRef } from "./ids.js";
import { simpDoc } from "./simp-doc.js";
import { orderedItems, section, stripCode } from "./markdown.js";
import { choiceMarker, getChoices } from "./graph.js";
import { bodyImages, isLocalUrl, resolveAsset } from "./assets.js";
import { issue, type Issue, type KBGraph, type KBNode } from "./types.js";
import type { SourceLocator } from "./source-lines.js";

const SUMMARY_MAX = 200;
const ORDERED_ITEM = /^\s*\d+\.\s+\S/m;

function findRequiresCycles(g: KBGraph): string[][] {
  const color = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const cycles = new Map<string, string[]>();
  const next = (id: string) =>
    g.out
      .get(id)!
      .filter(
        (e) =>
          (e.kind === "requires" || e.kind === "choice_option") &&
          g.nodes.has(e.to),
      )
      .map((e) => e.to);

  const visit = (id: string): void => {
    color.set(id, 1);
    stack.push(id);
    for (const to of next(id)) {
      const c = color.get(to);
      if (c === 1) {
        const cycle = stack.slice(stack.indexOf(to));
        const key = [...cycle].sort().join("|");
        if (!cycles.has(key)) cycles.set(key, [...cycle, to]);
      } else if (c === undefined) visit(to);
    }
    stack.pop();
    color.set(id, 2);
  };
  for (const id of g.nodes.keys()) if (!color.has(id)) visit(id);
  return [...cycles.values()];
}

/**
 * Checks graph references, dependency cycles, document structure, and authoring conventions.
 * @param g - Graph with adjacency indexes, normally produced by buildGraph.
 * @param locate - Optional source locator per node; when given, diagnostics carry source lines.
 * @param assets - KB-relative paths of the non-Markdown files; when given, missing images are reported (W110).
 * @returns Graph diagnostics; does not perform frontmatter schema validation.
 */
export function lintGraph(
  g: KBGraph,
  locate?: (node: KBNode) => SourceLocator | undefined,
  assets?: ReadonlySet<string>,
): Issue[] {
  const issues: Issue[] = [];
  const at = (n: KBNode, code: string, msg: string, line?: number) =>
    issues.push(issue(code, n.path, msg, line));
  // Line finders that tolerate a missing locator.
  const field = (n: KBNode, ...path: (string | number)[]) =>
    locate?.(n)?.field(path);
  const text = (n: KBNode, value: string) =>
    locate?.(n)?.frontmatterText(value);
  const bodyText = (n: KBNode, ...values: string[]) => {
    const source = locate?.(n);
    for (const value of values) {
      const line = source?.bodyText(value);
      if (line !== undefined) return line;
    }
    return undefined;
  };
  const refLine = (n: KBNode, e: { to: string; source: string }) =>
    e.source === "body" ? bodyText(n, `[[${e.to}`, e.to) : text(n, e.to);

  for (const n of g.nodes.values()) {
    const out = g.out.get(n.id)!;

    if (n.type === "simp" && Array.isArray(n.data.peers)) {
      const names = new Set<string>();
      n.data.peers.forEach((peer, index) => {
        const name = peer?.name;
        if (typeof name !== "string") return;
        const line = field(n, "peers", index, "name");
        if (name === n.data.name)
          at(n, "E012", `peers: "${name}" is this simp's own name`, line);
        if (names.has(name)) at(n, "E012", `duplicate peer "${name}"`, line);
        names.add(name);
      });
    }

    // E007 dangling references, W104 references to deprecated nodes
    for (const e of out) {
      const target = g.nodes.get(e.to);
      const label =
        e.source === "body" ? `[[${e.to}]]` : `${e.kind} → "${e.to}"`;
      const { simp } = parseRef(e.to);
      if (simp) {
        if (!simpDoc(g)?.peers.some((p) => p.name === simp))
          at(n, "E016", `${label}: unknown simp "${simp}"`, refLine(n, e));
        continue;
      }
      if (!target) at(n, "E007", `${label} does not exist`, refLine(n, e));
      else if (n.status === "active" && target.status === "deprecated")
        at(n, "W104", `${label} is deprecated`, refLine(n, e));
    }

    // E010 / E011 body structure
    const body = stripCode(n.body);
    if (n.type === "procedure") {
      const steps = section(body, "Steps");
      if (steps === null) at(n, "E010", `missing "## Steps" section`);
      else if (!ORDERED_ITEM.test(steps))
        at(
          n,
          "E010",
          `"## Steps" has no ordered list`,
          bodyText(n, "## Steps"),
        );
    }
    // E014/E015/W108 choices
    if (n.type === "procedure") {
      const choices = getChoices(n);
      const markers = orderedItems(section(n.body, "Steps") ?? "")
        .map(choiceMarker)
        .filter((m): m is string => !!m);
      const ids = new Set<string>();
      const rawChoices = n.data.choices as { id?: unknown }[];
      choices.forEach((c) => {
        const line = field(
          n,
          "choices",
          rawChoices.findIndex((raw) => raw?.id === c.id),
        );
        if (ids.has(c.id))
          at(
            n,
            "E015",
            `duplicate choice id "${c.id}"`,
            field(
              n,
              "choices",
              rawChoices.map((raw) => raw?.id).lastIndexOf(c.id),
            ),
          );
        ids.add(c.id);
        const refs = markers.filter((m) => m === c.id).length;
        if (refs !== 1)
          at(
            n,
            "E014",
            `choice "${c.id}" must be referenced exactly once in ## Steps as "choice:${c.id}" (found ${refs})`,
            refs > 1 ? bodyText(n, `choice:${c.id}`) : line,
          );
        const keys = c.options.map((o) => o.key);
        for (const k of new Set(keys.filter((k, i) => keys.indexOf(k) !== i)))
          at(
            n,
            "E015",
            `choice "${c.id}" has duplicate option key "${k}"`,
            line,
          );
        if (c.options.length === 1)
          at(n, "W108", `choice "${c.id}" has only one option`, line);
      });
      for (const m of new Set(markers))
        if (!ids.has(m))
          at(
            n,
            "E014",
            `step references unknown choice "${m}"`,
            bodyText(n, `choice:${m}`),
          );
    }
    // W110 missing image, W111 image without alt text
    for (const { alt, url } of bodyImages(n.body)) {
      if (!alt.trim())
        at(
          n,
          "W111",
          `image "${url}" has no alt text; agents read only the alt text`,
          bodyText(n, url),
        );
      if (!assets || !isLocalUrl(url)) continue;
      const src = resolveAsset(n.path, url);
      if (!src || !assets.has(src))
        at(
          n,
          "W110",
          `image "${url}" ${src ? "does not exist" : "is outside the KB"}`,
          bodyText(n, url),
        );
    }

    if (
      n.type === "goal" &&
      (section(body, "Steps") !== null || ORDERED_ITEM.test(body))
    )
      at(
        n,
        "E011",
        "goal body contains steps; move them to a procedure",
        bodyText(n, "## Steps") ?? firstOrderedLine(n, locate),
      );

    // W101 orphan (goals are entry points)
    if (
      n.type !== "goal" &&
      n.type !== "simp" &&
      !g.in.get(n.id)!.some((e) => e.from !== n.id)
    )
      at(n, "W101", "no inbound references (orphan)");

    if (n.type === "goal" && n.aliases.length === 0)
      at(n, "W102", "goal has no aliases", field(n, "aliases"));
    if (n.summary.length > SUMMARY_MAX)
      at(
        n,
        "W103",
        `summary is ${n.summary.length} chars (max ${SUMMARY_MAX})`,
        field(n, "summary"),
      );

    // W106 state never produced
    if (
      n.type === "state" &&
      !g.in.get(n.id)!.some((e) => e.kind === "produces")
    )
      at(n, "W106", "no procedure produces this state");

    // W107 procedure availability wider than a capability it uses
    if (n.type === "procedure") {
      for (const e of out) {
        const cap = g.nodes.get(e.to);
        if (e.kind !== "uses" || !cap?.availability) continue;
        const capPlans = cap.availability.plans;
        const plans = n.availability?.plans;
        if (
          capPlans?.length &&
          (!plans || plans.some((p) => !capPlans.includes(p)))
        )
          at(
            n,
            "W107",
            `availability.plans is wider than ${cap.id} (${capPlans.join(", ")})`,
            field(n, "availability", "plans") ?? refLine(n, e),
          );
        const missing = (cap.availability.permissions ?? []).filter(
          (p) => !(n.availability?.permissions ?? []).includes(p),
        );
        if (missing.length)
          at(
            n,
            "W107",
            `availability.permissions lacks ${missing.join(", ")} required by ${cap.id}`,
            field(n, "availability", "permissions") ?? refLine(n, e),
          );
      }
    }
  }

  // E009 requires cycles
  for (const cycle of findRequiresCycles(g)) {
    const first = g.nodes.get(cycle[0])!;
    at(
      first,
      "E009",
      `dependency cycle (requires/choices): ${cycle.join(" → ")}`,
      text(first, cycle[1]),
    );
  }

  // W105 alias shared by multiple goals
  const aliasOwners = new Map<string, KBNode[]>();
  for (const n of g.nodes.values()) {
    if (n.type !== "goal") continue;
    for (const a of n.aliases) {
      const key = a.trim().toLowerCase();
      aliasOwners.set(key, [...(aliasOwners.get(key) ?? []), n]);
    }
  }
  for (const [alias, owners] of aliasOwners) {
    if (owners.length < 2) continue;
    for (const n of owners) {
      const index = n.aliases.findIndex(
        (a) => a.trim().toLowerCase() === alias,
      );
      at(
        n,
        "W105",
        `alias "${alias}" also used by ${owners
          .filter((o) => o !== n)
          .map((o) => o.id)
          .join(", ")}`,
        field(n, "aliases", index),
      );
    }
  }

  return issues;
}

// Line of the first ordered-list item in a node's body.
function firstOrderedLine(
  n: KBNode,
  locate?: (node: KBNode) => SourceLocator | undefined,
): number | undefined {
  const item = stripCode(n.body)
    .split("\n")
    .find((line) => ORDERED_ITEM.test(line));
  return item === undefined ? undefined : locate?.(n)?.bodyText(item);
}

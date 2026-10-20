import { orderedItems, section, stripCode } from "./markdown.js";
import { choiceMarker, getChoices } from "./graph.js";
import { issue, type Issue, type KBGraph, type KBNode } from "./types.js";

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

export function lintGraph(g: KBGraph): Issue[] {
  const issues: Issue[] = [];
  const at = (n: KBNode, code: string, msg: string) =>
    issues.push(issue(code, n.path, msg));

  for (const n of g.nodes.values()) {
    const out = g.out.get(n.id)!;

    // E007 dangling references, W104 references to deprecated nodes
    for (const e of out) {
      const target = g.nodes.get(e.to);
      const label =
        e.source === "body" ? `[[${e.to}]]` : `${e.kind} → "${e.to}"`;
      if (!target) at(n, "E007", `${label} does not exist`);
      else if (n.status === "active" && target.status === "deprecated")
        at(n, "W104", `${label} is deprecated`);
    }

    // E010 / E011 body structure
    const body = stripCode(n.body);
    if (n.type === "procedure") {
      const steps = section(body, "Steps");
      if (steps === null) at(n, "E010", `missing "## Steps" section`);
      else if (!ORDERED_ITEM.test(steps))
        at(n, "E010", `"## Steps" has no ordered list`);
    }
    // E014/E015/W108 choices
    if (n.type === "procedure") {
      const choices = getChoices(n);
      const markers = orderedItems(section(n.body, "Steps") ?? "")
        .map(choiceMarker)
        .filter((m): m is string => !!m);
      const ids = new Set<string>();
      for (const c of choices) {
        if (ids.has(c.id)) at(n, "E015", `duplicate choice id "${c.id}"`);
        ids.add(c.id);
        const refs = markers.filter((m) => m === c.id).length;
        if (refs !== 1)
          at(
            n,
            "E014",
            `choice "${c.id}" must be referenced exactly once in ## Steps as "choice:${c.id}" (found ${refs})`,
          );
        const keys = c.options.map((o) => o.key);
        for (const k of new Set(keys.filter((k, i) => keys.indexOf(k) !== i)))
          at(n, "E015", `choice "${c.id}" has duplicate option key "${k}"`);
        if (c.options.length === 1)
          at(n, "W108", `choice "${c.id}" has only one option`);
      }
      for (const m of new Set(markers))
        if (!ids.has(m)) at(n, "E014", `step references unknown choice "${m}"`);
    }
    if (
      n.type === "goal" &&
      (section(body, "Steps") !== null || ORDERED_ITEM.test(body))
    )
      at(n, "E011", "goal body contains steps; move them to a procedure");

    // W101 orphan (goals are entry points)
    if (n.type !== "goal" && !g.in.get(n.id)!.some((e) => e.from !== n.id))
      at(n, "W101", "no inbound references (orphan)");

    if (n.type === "goal" && n.aliases.length === 0)
      at(n, "W102", "goal has no aliases");
    if (n.summary.length > SUMMARY_MAX)
      at(
        n,
        "W103",
        `summary is ${n.summary.length} chars (max ${SUMMARY_MAX})`,
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
          );
        const missing = (cap.availability.permissions ?? []).filter(
          (p) => !(n.availability?.permissions ?? []).includes(p),
        );
        if (missing.length)
          at(
            n,
            "W107",
            `availability.permissions lacks ${missing.join(", ")} required by ${cap.id}`,
          );
      }
    }
  }

  // E009 requires cycles
  for (const cycle of findRequiresCycles(g)) {
    issues.push(
      issue(
        "E009",
        g.nodes.get(cycle[0])!.path,
        `dependency cycle (requires/choices): ${cycle.join(" → ")}`,
      ),
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
    for (const n of owners)
      at(
        n,
        "W105",
        `alias "${alias}" also used by ${owners
          .filter((o) => o !== n)
          .map((o) => o.id)
          .join(", ")}`,
      );
  }

  return issues;
}

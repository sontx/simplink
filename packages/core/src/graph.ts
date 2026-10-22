import { extractBodyLinks } from "./links.js";
import { localize, isQualified } from "./ids.js";
import { stripCode } from "./markdown.js";
import {
  EDGE_KINDS,
  type ChoiceDef,
  type EdgeKind,
  type KBEdge,
  type KBGraph,
  type KBNode,
} from "./types.js";

/** Extracts unique wikilink targets in first-occurrence order, ignoring code.
 * @param body - Markdown containing [[id]], [[id|label]], or [[id#heading]] links.
 * @returns Trimmed target identifiers without labels or fragments. */
export function extractWikilinks(body: string): string[] {
  const ids = new Set<string>();
  for (const m of stripCode(body).matchAll(
    /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g,
  ))
    ids.add(m[1].trim());
  return [...ids];
}

/** Defensive read of a procedure's `choices` (schema errors are reported separately). */
export function getChoices(n: KBNode): ChoiceDef[] {
  const raw = n.data.choices;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) => {
    if (!c || typeof c !== "object" || typeof c.id !== "string") return [];
    const options = Array.isArray(c.options)
      ? c.options.filter(
          (o: unknown): o is ChoiceDef["options"][number] =>
            !!o &&
            typeof o === "object" &&
            typeof (o as any).key === "string" &&
            typeof (o as any).procedure === "string",
        )
      : [];
    return [
      {
        id: c.id,
        question: typeof c.question === "string" ? c.question : c.id,
        options,
      },
    ];
  });
}

/** Choice id from a step marker line: "choice:recipient" or "`choice:recipient`". */
export const choiceMarker = (step: string): string | null =>
  /^`?choice:([a-z0-9-]+)`?$/.exec(step.trim())?.[1] ?? null;

/**
 * Builds relationship edges and adjacency indexes from normalized nodes.
 * @param nodes - Nodes keyed by identifier; retained by reference.
 * @returns A snapshot including frontmatter, choice-option, and body wikilink edges.
 */
export function buildGraph(nodes: Map<string, KBNode>): KBGraph {
  const edges: KBEdge[] = [];
  for (const node of nodes.values()) {
    for (const kind of EDGE_KINDS) {
      const targets = node.data[kind];
      if (!Array.isArray(targets)) continue;
      for (const to of targets)
        if (typeof to === "string")
          edges.push({ from: node.id, to, kind, source: "frontmatter" });
    }
    for (const c of getChoices(node))
      for (const o of c.options)
        edges.push({
          from: node.id,
          to: o.procedure,
          kind: "choice_option",
          source: "frontmatter",
        });
    const ownName = nodes.get("simp")?.data.name;
    for (const bodyLink of extractBodyLinks(node.body)) {
      const to = localize(
        bodyLink.ref,
        typeof ownName === "string" ? ownName : undefined,
      );
      if (to !== node.id)
        edges.push({ from: node.id, to, kind: "related", source: "body" });
    }
  }

  const out = new Map<string, KBEdge[]>();
  const inc = new Map<string, KBEdge[]>();
  for (const id of nodes.keys()) {
    out.set(id, []);
    inc.set(id, []);
  }
  for (const e of edges) {
    out.get(e.from)!.push(e);
    if (isQualified(e.to) && !inc.has(e.to)) inc.set(e.to, []);
    inc.get(e.to)?.push(e);
  }
  return { nodes, edges, out, in: inc };
}

export { stripCode };

/**
 * Reverse edges walked to surface goals from a non-goal hit.
 * Excludes satisfied_by/produces (fix procedures are not the user's intent) and related (noisy).
 */
const GOAL_PATH_KINDS: ReadonlySet<EdgeKind> = new Set([
  "procedures",
  "requires",
  "choice_option",
  "preconditions",
  "optional_preconditions",
  "uses",
  "constrained_by",
]);

/** Graphs are snapshots; rebuild after mutation to invalidate traversal caches. */
const GOAL_CACHE = new WeakMap<KBGraph, Map<string, Map<string, number>>>();
/**
 * Finds goals reachable through incoming intent relationships, up to four hops away.
 * @param graph - Graph snapshot; rebuild after changes to invalidate traversal caches.
 * @param start - Starting node identifier.
 * @returns A cached map of goal identifiers to hop counts. Treat it as read-only.
 */
export function goalsOf(graph: KBGraph, start: string): Map<string, number> {
  let goalCache = GOAL_CACHE.get(graph);
  if (!goalCache) GOAL_CACHE.set(graph, (goalCache = new Map()));
  const cached = goalCache.get(start);
  if (cached) return cached;
  const found = new Map<string, number>();
  const seen = new Set([start]);
  let frontier = [start];
  for (let hops = 1; hops <= 4 && frontier.length; hops++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of graph.in.get(id) ?? []) {
        if (!GOAL_PATH_KINDS.has(e.kind) || seen.has(e.from)) continue;
        seen.add(e.from);
        if (graph.nodes.get(e.from)?.type === "goal") found.set(e.from, hops);
        else next.push(e.from);
      }
    }
    frontier = next;
  }
  goalCache.set(start, found);
  return found;
}

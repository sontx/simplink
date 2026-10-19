import { stripCode } from "./markdown.js";
import { EDGE_KINDS, type ChoiceDef, type KBEdge, type KBGraph, type KBNode } from "./types.js";

/** [[id]], [[id|label]], [[id#heading]] */
export function extractWikilinks(body: string): string[] {
  const ids = new Set<string>();
  for (const m of stripCode(body).matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)) ids.add(m[1].trim());
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
            !!o && typeof o === "object" && typeof (o as any).key === "string" && typeof (o as any).procedure === "string",
        )
      : [];
    return [{ id: c.id, question: typeof c.question === "string" ? c.question : c.id, options }];
  });
}

/** Choice id from a step marker line: "choice:recipient" or "`choice:recipient`". */
export const choiceMarker = (step: string): string | null => /^`?choice:([a-z0-9-]+)`?$/.exec(step.trim())?.[1] ?? null;

export function buildGraph(nodes: Map<string, KBNode>): KBGraph {
  const edges: KBEdge[] = [];
  for (const node of nodes.values()) {
    for (const kind of EDGE_KINDS) {
      const targets = node.data[kind];
      if (!Array.isArray(targets)) continue;
      for (const to of targets) if (typeof to === "string") edges.push({ from: node.id, to, kind, source: "frontmatter" });
    }
    for (const c of getChoices(node))
      for (const o of c.options) edges.push({ from: node.id, to: o.procedure, kind: "choice_option", source: "frontmatter" });
    for (const to of extractWikilinks(node.body)) {
      if (to !== node.id) edges.push({ from: node.id, to, kind: "related", source: "body" });
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
    inc.get(e.to)?.push(e);
  }
  return { nodes, edges, out, in: inc };
}

export { stripCode };

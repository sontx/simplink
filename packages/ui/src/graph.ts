import type { KBEdge } from "@sontx/simplink-core";
import type { NodeSummary } from "./api.js";
import type { NodeChange, XYPosition } from "@xyflow/react";

export interface NodeLayout {
  position?: XYPosition;
  measured?: { width: number; height: number };
}

// Controlled React Flow drops `measured` on new node objects, hiding them, so dimensions must be kept too.
export function applyLayoutChanges(
  layout: Record<string, NodeLayout>,
  changes: NodeChange[],
): Record<string, NodeLayout> {
  let next = layout;
  for (const change of changes) {
    let patch: NodeLayout;
    if (change.type === "position" && change.position)
      patch = { position: change.position };
    else if (change.type === "dimensions" && change.dimensions)
      patch = { measured: change.dimensions };
    else continue;
    if (next === layout) next = { ...layout };
    next[change.id] = { ...next[change.id], ...patch };
  }
  return next;
}

export interface GraphFilters {
  types?: string[];
  kinds?: string[];
  deprecated?: boolean;
  issuesOnly?: boolean;
  issuePaths?: Set<string>;
}

export function neighborhood(
  nodes: NodeSummary[],
  edges: KBEdge[],
  focus?: string,
  depth: number | "all" = 1,
  filters: GraphFilters = {},
) {
  const allowed = nodes.filter(
    (n) =>
      (!filters.types || filters.types.includes(n.type)) &&
      (filters.deprecated || n.status !== "deprecated") &&
      (!filters.issuesOnly || filters.issuePaths?.has(n.path)),
  );
  const ids = new Set(allowed.map((n) => n.id));
  const known = new Set(nodes.map((n) => n.id));
  const links = edges.filter(
    (e) =>
      (!filters.kinds || filters.kinds.includes(e.kind)) &&
      ids.has(e.from) &&
      (ids.has(e.to) || !known.has(e.to)),
  );
  const seen = new Set(
    depth === "all"
      ? ids
      : focus
        ? ids.has(focus)
          ? [focus]
          : []
        : allowed.filter((n) => n.type === "goal").map((n) => n.id),
  );
  if (depth !== "all") {
    let frontier = new Set(seen);
    for (let hop = 0; hop < depth; hop++) {
      const next = new Set<string>();
      for (const e of links) {
        if (frontier.has(e.from) && !seen.has(e.to)) next.add(e.to);
        if (frontier.has(e.to) && !seen.has(e.from)) next.add(e.from);
      }
      for (const id of next) seen.add(id);
      frontier = next;
    }
  } else for (const e of links) seen.add(e.to);
  return {
    nodes: allowed.filter((n) => seen.has(n.id)),
    edges: links.filter((e) => seen.has(e.from) && seen.has(e.to)),
  };
}

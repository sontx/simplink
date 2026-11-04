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

/** Nodes nothing points to. Goals are entry points and simp.md is the root. */
export function orphanNodes(nodes: NodeSummary[], edges: KBEdge[]) {
  const targets = new Set(edges.map((e) => e.to));
  return nodes.filter(
    (n) => n.type !== "goal" && n.type !== "simp" && !targets.has(n.id),
  );
}

export type StartReason = "error" | "warning" | "orphan" | "edited" | "goal";

/**
 * Where the graph opens when no node is focused: where the author's attention
 * belongs (problems first), else where they last worked, else the busiest goal.
 */
export function startNode(
  nodes: NodeSummary[],
  edges: KBEdge[],
  issues: { path: string; severity: string }[],
  lastEdited?: string,
): { id: string; reason: StartReason } | undefined {
  const live = nodes.filter((n) => n.type !== "simp");
  const byPath = (path?: string) => live.find((n) => n.path === path);
  for (const severity of ["error", "warning"] as const) {
    const node = byPath(issues.find((i) => i.severity === severity)?.path);
    if (node) return { id: node.id, reason: severity };
  }
  const orphan = orphanNodes(live, edges).find(
    (n) => n.status !== "deprecated",
  );
  if (orphan) return { id: orphan.id, reason: "orphan" };
  const edited = byPath(lastEdited);
  if (edited) return { id: edited.id, reason: "edited" };
  const degree = (id: string) =>
    edges.filter((e) => e.from === id || e.to === id).length;
  const goal = live
    .filter((n) => n.type === "goal" && n.status !== "deprecated")
    .reduce<NodeSummary | undefined>(
      (best, n) => (!best || degree(n.id) > degree(best.id) ? n : best),
      undefined,
    );
  return goal ? { id: goal.id, reason: "goal" } : undefined;
}

/** The area folder a node lives in: `procedures/zalo/send.md` → `zalo`; top-level files → "". */
export const nodeArea = (path: string) => {
  const parts = path.split("/");
  return parts.length > 2 ? parts[1] : "";
};

export type Cluster = {
  id: string;
  area: string;
  count: number;
  /** Node count per type, in first-seen order. */
  types: [string, number][];
  errors: number;
  warnings: number;
  /** The node with the most relationships, where a click on the cluster lands. */
  entry: string;
};

/**
 * The whole map at a readable size: nodes collapse into one card per area
 * folder, and relationships between areas become weighted links.
 */
export function clusterGraph(
  nodes: NodeSummary[],
  edges: KBEdge[],
  issues: { path: string; severity: string }[],
) {
  const areaOf = new Map(nodes.map((n) => [n.id, nodeArea(n.path)]));
  const degree = new Map<string, number>();
  for (const e of edges)
    for (const id of [e.from, e.to]) degree.set(id, (degree.get(id) ?? 0) + 1);
  const clusters = new Map<string, Cluster>();
  for (const n of nodes) {
    const area = areaOf.get(n.id)!;
    const cluster = clusters.get(area) ?? {
      id: `area:${area}`,
      area,
      count: 0,
      types: [],
      errors: 0,
      warnings: 0,
      entry: n.id,
    };
    cluster.count++;
    const type = cluster.types.find(([t]) => t === n.type);
    if (type) type[1]++;
    else cluster.types.push([n.type, 1]);
    for (const issue of issues)
      if (issue.path === n.path)
        cluster[issue.severity === "error" ? "errors" : "warnings"]++;
    if ((degree.get(n.id) ?? 0) > (degree.get(cluster.entry) ?? 0))
      cluster.entry = n.id;
    clusters.set(area, cluster);
  }
  const links = new Map<string, { from: string; to: string; weight: number }>();
  for (const e of edges) {
    const from = areaOf.get(e.from);
    const to = areaOf.get(e.to);
    if (from === undefined || to === undefined || from === to) continue;
    const key = `${from}\u0000${to}`;
    const link = links.get(key) ?? {
      from: `area:${from}`,
      to: `area:${to}`,
      weight: 0,
    };
    link.weight++;
    links.set(key, link);
  }
  return {
    clusters: [...clusters.values()].sort((a, b) =>
      a.area.localeCompare(b.area),
    ),
    links: [...links.values()],
  };
}

/** Plan order, left to right: what the author wants, how, with what, under which conditions. */
export const LANE_ORDER = [
  "simp",
  "goal",
  "procedure",
  "capability",
  "state",
  "constraint",
];

export const LANE = { width: 230, height: 90, gapX: 110, gapY: 28 };

/**
 * Lays nodes out in one column per type, in plan order, so a plan reads left
 * to right. Rows within a column follow their neighbours (barycentre sweeps)
 * to keep crossings down. Unknown types and missing targets trail at the end.
 */
export function laneLayout(
  nodes: { id: string; type: string }[],
  edges: { from: string; to: string }[],
) {
  const laneOf = (type: string) => {
    const index = LANE_ORDER.indexOf(type);
    return index < 0 ? (type === "missing" ? 99 : 98) : index;
  };
  const keys = [...new Set(nodes.map((n) => laneOf(n.type)))].sort(
    (a, b) => a - b,
  );
  const columns = keys.map((key) =>
    nodes
      .filter((n) => laneOf(n.type) === key)
      .map((n) => n.id)
      .sort(),
  );
  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    neighbours.set(e.from, [...(neighbours.get(e.from) ?? []), e.to]);
    neighbours.set(e.to, [...(neighbours.get(e.to) ?? []), e.from]);
  }
  const row = new Map<string, number>();
  const place = () =>
    columns.forEach((column) => column.forEach((id, i) => row.set(id, i)));
  place();
  // Each sweep orders a column by its neighbours' mean row in the other columns.
  const sweep = (order: number[]) => {
    for (const c of order) {
      const own = new Set(columns[c]);
      const weight = (id: string) => {
        const rows = (neighbours.get(id) ?? [])
          .filter((other) => !own.has(other) && row.has(other))
          .map((other) => row.get(other)!);
        return rows.length
          ? rows.reduce((sum, r) => sum + r, 0) / rows.length
          : row.get(id)!;
      };
      columns[c] = [...columns[c]].sort((a, b) => weight(a) - weight(b));
      columns[c].forEach((id, i) => row.set(id, i));
    }
  };
  const forward = columns.map((_, i) => i);
  for (let pass = 0; pass < 2; pass++) {
    sweep(forward.slice(1));
    sweep(forward.slice(0, -1).reverse());
  }
  const tallest = Math.max(0, ...columns.map((c) => c.length));
  const positions = new Map<string, { x: number; y: number }>();
  const lanes = columns.map((column, c) => {
    const x = c * (LANE.width + LANE.gapX);
    // Short columns sit centred against the tallest one.
    const top = ((tallest - column.length) * (LANE.height + LANE.gapY)) / 2;
    column.forEach((id, i) =>
      positions.set(id, { x, y: top + i * (LANE.height + LANE.gapY) }),
    );
    const key = keys[c];
    return {
      type: key === 99 ? "missing" : key === 98 ? "other" : LANE_ORDER[key],
      x,
      top,
      count: column.length,
    };
  });
  return { positions, lanes };
}

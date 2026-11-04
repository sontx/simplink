import test from "node:test";
import assert from "node:assert/strict";
import {
  clusterGraph,
  areaLayout,
  laneLayout,
  pairLinks,
  ringLayout,
  neighborhood,
  startNode,
} from "../src/graph.js";
test("neighborhood follows both directions, limits depth and respects kinds", () => {
  const nodes = ["a", "b", "c", "d"].map((id) => ({
    id,
    type: "procedure" as const,
    path: `${id}.md`,
    title: id,
    summary: "",
    status: "active" as const,
    tags: [],
  }));
  const edges = [
    {
      from: "a",
      to: "b",
      kind: "requires" as const,
      source: "frontmatter" as const,
    },
    {
      from: "b",
      to: "c",
      kind: "requires" as const,
      source: "frontmatter" as const,
    },
    {
      from: "c",
      to: "d",
      kind: "uses" as const,
      source: "frontmatter" as const,
    },
  ];
  assert.deepEqual(
    neighborhood(nodes, edges, "b", 1).nodes.map((n) => n.id),
    ["a", "b", "c"],
  );
  assert.equal(neighborhood(nodes, edges, "b", 2).nodes.length, 4);
  assert.equal(
    neighborhood(nodes, edges, "b", 2, { kinds: ["requires"] }).nodes.length,
    3,
  );
});

test("startNode opens on problems first, then orphans, the last edit and the busiest goal", () => {
  const node = (id: string, type: string, status = "active") => ({
    id,
    type: type as "goal",
    path: `${id}.md`,
    title: id,
    summary: "",
    status: status as "active",
    tags: [],
  });
  const nodes = [
    node("g1", "goal"),
    node("g2", "goal"),
    node("p1", "procedure"),
    node("p2", "procedure"),
    node("c1", "capability"),
  ];
  const edge = (from: string, to: string) => ({
    from,
    to,
    kind: "requires" as const,
    source: "frontmatter" as const,
  });
  const edges = [
    edge("g1", "p1"),
    edge("g2", "p1"),
    edge("g2", "p2"),
    edge("p1", "c1"),
  ];
  assert.deepEqual(
    startNode(nodes, edges, [
      { path: "p2.md", severity: "warning" },
      { path: "c1.md", severity: "error" },
    ]),
    { id: "c1", reason: "error" },
  );
  assert.deepEqual(
    startNode(nodes, edges, [{ path: "p2.md", severity: "warning" }]),
    { id: "p2", reason: "warning" },
  );
  assert.deepEqual(
    startNode(nodes, edges.slice(0, 2).concat(edge("p1", "c1")), []),
    {
      id: "p2",
      reason: "orphan",
    },
  );
  assert.deepEqual(startNode(nodes, edges, [], "p1.md"), {
    id: "p1",
    reason: "edited",
  });
  assert.deepEqual(startNode(nodes, edges, []), { id: "g2", reason: "goal" });
  assert.equal(startNode([], [], []), undefined);
});

test("clusterGraph groups nodes by area folder and weights links between areas", () => {
  const node = (id: string, type: string, path: string) => ({
    id,
    type: type as "goal",
    path,
    title: id,
    summary: "",
    status: "active" as const,
    tags: [],
  });
  const nodes = [
    node("g.a", "goal", "goals/alpha/a.md"),
    node("p.a", "procedure", "procedures/alpha/a.md"),
    node("p.a2", "procedure", "procedures/alpha/a2.md"),
    node("c.b", "capability", "capabilities/beta/b.md"),
    node("top", "goal", "goals/top.md"),
  ];
  const edge = (from: string, to: string) => ({
    from,
    to,
    kind: "requires" as const,
    source: "frontmatter" as const,
  });
  const { clusters, links } = clusterGraph(
    nodes,
    [
      edge("g.a", "p.a"),
      edge("g.a", "p.a2"),
      edge("p.a", "c.b"),
      edge("p.a2", "c.b"),
      edge("top", "p.a"),
    ],
    [{ path: "procedures/alpha/a2.md", severity: "error" }],
  );
  assert.deepEqual(
    clusters.map((c) => [c.area, c.count, c.types, c.errors, c.entry]),
    [
      ["", 1, [["goal", 1]], 0, "top"],
      [
        "alpha",
        3,
        [
          ["goal", 1],
          ["procedure", 2],
        ],
        1,
        "p.a",
      ],
      ["beta", 1, [["capability", 1]], 0, "c.b"],
    ],
  );
  assert.deepEqual(
    links.map((l) => [l.from, l.to, l.weight]),
    [
      ["area:alpha", "area:beta", 2],
      ["area:", "area:alpha", 1],
    ],
  );
});

test("laneLayout puts types in plan-order columns and orders rows by neighbours", () => {
  const nodes = [
    { id: "c.z", type: "capability" },
    { id: "c.a", type: "capability" },
    { id: "p.2", type: "procedure" },
    { id: "p.1", type: "procedure" },
    { id: "g", type: "goal" },
    { id: "gone", type: "missing" },
  ];
  const edges = [
    { from: "g", to: "p.1" },
    { from: "g", to: "p.2" },
    { from: "p.1", to: "c.z" },
    { from: "p.2", to: "c.a" },
    { from: "p.2", to: "gone" },
  ];
  const { positions, lanes } = laneLayout(nodes, edges);
  assert.deepEqual(
    lanes.map((l) => [l.type, l.count]),
    [
      ["goal", 1],
      ["procedure", 2],
      ["capability", 2],
      ["missing", 1],
    ],
  );
  const x = (id: string) => positions.get(id)!.x;
  const y = (id: string) => positions.get(id)!.y;
  assert.ok(x("g") < x("p.1") && x("p.1") < x("c.a") && x("c.a") < x("gone"));
  // Each capability lines up with the procedure that uses it.
  assert.equal(Math.sign(y("c.z") - y("c.a")), Math.sign(y("p.1") - y("p.2")));
});

test("pairLinks folds reciprocal area links into one pair with both directions", () => {
  assert.deepEqual(
    pairLinks([
      { from: "area:b", to: "area:a", weight: 2 },
      { from: "area:a", to: "area:b", weight: 3 },
      { from: "area:a", to: "area:c", weight: 1 },
    ]),
    [
      { a: "area:a", b: "area:b", ab: 3, ba: 2 },
      { a: "area:a", b: "area:c", ab: 1, ba: 0 },
    ],
  );
});

test("ringLayout seats heavily linked areas next to each other without overlap", () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  // a-d and b-e are heavy; alphabetical seats would put them opposite.
  const pairs = [
    { a: "a", b: "d", ab: 9, ba: 0 },
    { a: "b", b: "e", ab: 9, ba: 0 },
    { a: "c", b: "f", ab: 9, ba: 0 },
  ];
  const positions = ringLayout(ids, pairs);
  const seat = (id: string) => {
    const { x, y } = positions.get(id)!;
    return Math.atan2(y + 45, x + 115);
  };
  const apart = (p: string, q: string) => {
    const gap = Math.abs(seat(p) - seat(q));
    return Math.min(gap, 2 * Math.PI - gap);
  };
  for (const { a, b } of pairs)
    assert.ok(apart(a, b) < Math.PI / 2, `${a}-${b}`);
  const boxes = [...positions.values()];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.ok(
        Math.abs(boxes[i]!.x - boxes[j]!.x) >= 230 ||
          Math.abs(boxes[i]!.y - boxes[j]!.y) >= 90,
        "cards overlap",
      );
});

test("areaLayout packs unlinked areas into a compact grid under the linked ring", () => {
  const ids = Array.from({ length: 14 }, (_, i) => `area:${i}`);
  const { positions, mode, unlinked } = areaLayout(ids, [
    { a: "area:3", b: "area:7", ab: 2, ba: 0 },
  ]);
  assert.equal(mode, "ring");
  assert.equal(unlinked?.count, 12);
  // The linked pair sits side by side above everything else.
  assert.equal(positions.get("area:3")!.y, positions.get("area:7")!.y);
  for (const id of ids)
    if (id !== "area:3" && id !== "area:7")
      assert.ok(positions.get(id)!.y > unlinked!.y);
  // Twelve cards pack in a few rows, not a ring a screen and a half wide.
  const xs = [...positions.values()].map((p) => p.x);
  const ys = [...positions.values()].map((p) => p.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) < 1500);
  assert.ok(Math.max(...ys) - Math.min(...ys) < 600);
});

test("areaLayout switches many linked areas to an adjacency-ordered grid", () => {
  const ids = Array.from(
    { length: 16 },
    (_, i) => `area:${String(i).padStart(2, "0")}`,
  );
  // A chain 0-1-2-…-15: the order should keep chain neighbours adjacent.
  const pairs = ids.slice(1).map((b, i) => ({ a: ids[i]!, b, ab: 1, ba: 0 }));
  const { positions, mode, unlinked } = areaLayout(ids, pairs);
  assert.equal(mode, "grid");
  assert.equal(unlinked, undefined);
  for (const { a, b } of pairs) {
    const p = positions.get(a)!;
    const q = positions.get(b)!;
    assert.ok(
      Math.abs(p.x - q.x) + Math.abs(p.y - q.y) <= 290 * 1.5,
      `${a}-${b}`,
    );
  }
});

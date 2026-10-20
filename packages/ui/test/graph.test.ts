import test from "node:test";
import assert from "node:assert/strict";
import { neighborhood } from "../web/src/graph.js";
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

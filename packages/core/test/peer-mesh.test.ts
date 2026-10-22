import test from "node:test";
import assert from "node:assert/strict";
import { product } from "./federation-helpers.js";
import { goal, proc, state } from "./helpers.js";
import { createPeerService } from "../src/federation/service.js";
import { newTrace, type Peer } from "../src/federation/protocol.js";

async function mesh() {
  const crm = createPeerService({
    kb: await product("crm", [], {
      "goals/c.md": goal([]).replace("title: G", "title: Unicorn"),
      "states/c.md": state("Narwhal", "procedure.c"),
      "procedures/c.md": proc("C"),
    }),
  });
  const y = createPeerService({
    kb: await product("y", ["crm"], {
      "procedures/b.md": proc("Banana", "requires: [procedure.c]\n"),
      "procedures/c.md": proc("C"),
    }),
    peers: [crm],
  });
  const x = createPeerService({
    kb: await product("x", ["y", "crm"], {
      "goals/g.md": goal(["procedure.p"]),
      "procedures/p.md": proc("P", "preconditions: [crm:state.c]\n"),
    }),
    peers: [y],
  });
  return { x, y, crm };
}

test("explore merges hits across the mesh with qualified ids", async () => {
  const { x } = await mesh();
  const result = await x.explore({ query: "Unicorn", trace: newTrace() });
  assert.equal(result.hits[0].id, "crm:goal.c");
  assert.deepEqual(result.sources.map((s) => s.simp).sort(), ["crm", "x", "y"]);
  assert.equal(
    (await x.lookup({ ids: [result.hits[0].id], trace: newTrace() })).nodes[0]
      .id,
    "crm:goal.c",
  );
});

test("hop limit stops forwarding", async () => {
  const { x } = await mesh();
  const result = await x.explore({ query: "Unicorn", trace: newTrace(1) });
  assert.equal(result.hits.length, 0);
  assert.ok(!result.sources.some((s) => s.simp === "crm"));
});

test("local goals surface for remote hits", async () => {
  const { x } = await mesh();
  const result = await x.explore({ query: "Narwhal", trace: newTrace() });
  assert.ok(
    result.goals.some(
      (g) => g.id === "goal.g" && g.via.some((v) => v.id === "crm:state.c"),
    ),
  );
});

test("lookup forwards qualified ids and rewrites fields", async () => {
  const { x } = await mesh();
  const result = await x.lookup({ ids: ["y:procedure.b"], trace: newTrace() });
  assert.equal(result.nodes[0].id, "y:procedure.b");
  assert.deepEqual(result.nodes[0].fields.requires, ["y:procedure.c"]);
});

test("lookup reaches an indirect simp and respects zero hops", async () => {
  const { x } = await mesh();
  assert.equal(
    (await x.lookup({ ids: ["crm:state.c"], trace: newTrace() })).nodes[0].id,
    "crm:state.c",
  );
  assert.deepEqual(
    (await x.lookup({ ids: ["crm:state.c"], trace: newTrace(0) })).missing,
    ["crm:state.c"],
  );
});

test("visited prevents loops", async () => {
  const linked: Peer[] = [];
  const x = createPeerService({
    kb: await product("x", ["y"]),
    peers: () => linked,
  });
  const y = createPeerService({ kb: await product("y", ["x"]), peers: [x] });
  linked.push(y);
  assert.deepEqual(
    (await x.explore({ query: "Product", trace: newTrace() })).sources
      .map((s) => s.simp)
      .sort(),
    ["x", "y"],
  );
});

test("slow peer becomes a failed source", async () => {
  const { y } = await mesh();
  const slow: Peer = {
    ...y,
    name: "slow",
    explore: () => new Promise(() => {}),
  };
  const x = createPeerService({
    kb: await product("x", ["slow"]),
    peers: [slow],
    timeoutMs: 10,
  });
  assert.ok(
    (await x.explore({ query: "anything", trace: newTrace() })).sources.some(
      (s) => s.simp === "slow" && !s.ok,
    ),
  );
});

test("spoofed nodes are rejected", async () => {
  const { y } = await mesh();
  const bad: Peer = {
    ...y,
    explore: async () => ({
      hits: [
        {
          id: "billing:goal.z",
          type: "goal",
          title: "Spoof",
          summary: "",
          score: 1,
          relevance: 1,
          matched: {},
          goals: [],
        },
      ],
      goals: [],
      sources: [{ simp: "y", ok: true, ms: 0 }],
    }),
  };
  const x = createPeerService({ kb: await product("x", ["y"]), peers: [bad] });
  assert.equal(
    (await x.explore({ query: "Spoof", trace: newTrace() })).hits.length,
    0,
  );
});

test("local hits win ties", async () => {
  const files = { "procedures/a.md": proc("Banana") };
  const y = createPeerService({ kb: await product("y", [], files) });
  const x = createPeerService({
    kb: await product("x", ["y"], files),
    peers: [y],
  });
  assert.equal(
    (await x.explore({ query: "Banana", trace: newTrace() })).hits[0].id,
    "procedure.a",
  );
});

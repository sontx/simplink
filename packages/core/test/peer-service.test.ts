import test from "node:test";
import assert from "node:assert/strict";
import { product } from "./federation-helpers.js";
import { createPeerService } from "../src/federation/service.js";
import { newTrace } from "../src/federation/protocol.js";
import { goal, proc, state } from "./helpers.js";

test("manifest reflects simp.md", async () => {
  const service = createPeerService({ kb: await product("x", ["crm"]) });
  const manifest = await service.manifest();
  assert.equal(manifest.protocol, 1);
  assert.equal(manifest.name, "x");
  assert.deepEqual(manifest.serves, ["pull"]);
  assert.deepEqual(manifest.peers, ["crm"]);
  assert.equal(manifest.errors, 0);
});

test("explore returns local hits with sources", async () => {
  const service = createPeerService({
    kb: await product("x", [], {
      "goals/a.md": goal([]).replace("title: G", "title: Zebra"),
    }),
  });
  const result = await service.explore({ query: "Zebra", trace: newTrace() });
  assert.equal(result.hits[0].id, "goal.a");
  assert.equal(result.sources[0].simp, "x");
  assert.equal(result.sources[0].ok, true);
});

test("lookup returns nodes with fields and edges and reports missing ids", async () => {
  const service = createPeerService({
    kb: await product("x", [], {
      "procedures/a.md": proc("A", "preconditions: [state.x]\n"),
      "states/x.md": state("X", "procedure.a"),
    }),
  });
  const result = await service.lookup({
    ids: ["procedure.a", "procedure.nope"],
    trace: newTrace(),
  });
  assert.deepEqual(result.nodes[0].fields.preconditions, ["state.x"]);
  assert.ok(
    result.nodes[0].out.some(
      (e) => e.kind === "preconditions" && e.to === "state.x",
    ),
  );
  assert.deepEqual(result.missing, ["procedure.nope"]);
  assert.equal(result.nodes[0].body, undefined);
  assert.ok(
    (
      await service.lookup({
        ids: ["procedure.a"],
        body: true,
        trace: newTrace(),
      })
    ).nodes[0].body,
  );
});

test("list returns every local node without bodies", async () => {
  const kb = await product("x", ["crm"], {
    "goals/a.md": goal(["procedure.p"]),
    "procedures/p.md": proc("P", "requires: [crm:procedure.import]\n"),
  });
  const { nodes } = await createPeerService({ kb }).list();
  assert.deepEqual(
    nodes.map((n) => n.id).sort(),
    [...kb.graph.nodes.keys()].sort(),
  );
  assert.ok(nodes.every((n) => n.body === undefined));
});

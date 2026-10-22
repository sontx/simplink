import test from "node:test";
import assert from "node:assert/strict";
import { product } from "./federation-helpers.js";
import { goal, proc } from "./helpers.js";
import { createPeerService } from "../src/federation/service.js";
import { createFederatedKB, isFederatedKB } from "../src/federation/kb.js";

test("local-only federated KB matches kb.search ids", async () => {
  const local = await product("x", [], {
    "goals/a.md": goal([]).replace("title: G", "title: Zebra"),
  });
  const kb = await createFederatedKB({ local });
  assert.deepEqual(
    (await kb.search("Zebra")).hits.map((h) => h.id),
    (await local.search("Zebra")).hits.map((h) => h.id),
  );
  assert.ok(isFederatedKB(kb));
  assert.ok(!isFederatedKB(local));
});

test("node returns local and remote nodes and status reports peer health", async () => {
  const crm = createPeerService({
    kb: await product("crm", [], { "goals/c.md": goal([]) }),
  });
  const kb = await createFederatedKB({
    local: await product("x", ["crm"], { "goals/a.md": goal([]) }),
    peers: [crm],
  });
  assert.equal((await kb.node("goal.a"))?.id, "goal.a");
  assert.equal((await kb.node("crm:goal.c"))?.id, "crm:goal.c");
  assert.equal(await kb.node("crm:goal.none"), undefined);
  assert.equal(kb.status.simp, "x");
  assert.equal((await kb.peers())[0].ok, true);
});

test("home mode keeps the home simp ids unqualified", async () => {
  const crm = createPeerService({
    kb: await product("crm", [], { "procedures/c.md": proc("Banana") }),
  });
  const y = createPeerService({
    kb: await product("y", ["crm"], { "procedures/b.md": proc("Banana") }),
    peers: [crm],
  });
  const kb = await createFederatedKB({ home: y });
  const ids = (await kb.search("Banana")).hits.map((h) => h.id);
  assert.ok(ids.includes("procedure.b"));
  assert.ok(ids.includes("crm:procedure.c"));
  assert.equal(kb.status.root, "y");
  assert.equal(kb.local, undefined);
});

test("own-qualified node requests retain lookup aliases", async () => {
  const local = await product("x", [], { "goals/a.md": goal([]) });
  const kb = await createFederatedKB({ local });
  assert.equal((await kb.node("x:goal.a"))?.id, "goal.a");
  assert.ok((await kb.nodes(["x:goal.a"])).has("x:goal.a"));
});

test("home mode delegates an unqualified procedure when only delegate is served", async () => {
  const local = await product("crm", [], { "procedures/a.md": proc("Import") });
  local.graph.nodes.get("simp")!.data.serves = ["delegate"];
  const service = createPeerService({ kb: local });
  let calls = 0;
  const home = {
    ...service,
    resolve: async (
      ...args: Parameters<NonNullable<typeof service.resolve>>
    ) => {
      calls++;
      assert.equal(args[0].states?.["state.known"], true);
      assert.equal(args[0].choices?.source, "api");
      return service.resolve!(...args);
    },
  };
  const kb = await createFederatedKB({ home });
  await kb.resolveProcedure("procedure.a", {
    states: { "state.known": true },
    choices: { source: "api" },
  });
  assert.equal(calls, 1);
});

test("hop zero prevents direct delegation and delegated trace advances", async () => {
  const local = await product("x", ["crm"], {
    "procedures/a.md": proc("Send", "requires: [crm:procedure.import]\n"),
  });
  const crm = await product("crm", [], {
    "procedures/import.md": proc("Import"),
  });
  crm.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const service = createPeerService({ kb: crm });
  const traces: Parameters<NonNullable<typeof service.resolve>>[0]["trace"][] =
    [];
  const peer = {
    ...service,
    resolve: async (
      ...args: Parameters<NonNullable<typeof service.resolve>>
    ) => {
      traces.push(args[0].trace);
      return service.resolve!(...args);
    },
  };
  const zero = await createFederatedKB({
    local,
    peers: [peer],
    modes: { crm: "delegate" },
    hops: 0,
  });
  await zero.resolveProcedure("procedure.a");
  assert.equal(traces.length, 0);
  const normal = await createFederatedKB({
    local,
    peers: [peer],
    modes: { crm: "delegate" },
    hops: 2,
  });
  await normal.resolveProcedure("procedure.a");
  assert.equal(traces.length, 1);
  assert.equal(traces[0].hops, 1);
  assert.deepEqual(traces[0].visited, ["x"]);
});

test("peer-only options retain all peers with qualified ids", async () => {
  const home = createPeerService({
    kb: await product("crm", [], { "procedures/a.md": proc("Banana") }),
  });
  const other = createPeerService({
    kb: await product("other", [], { "procedures/b.md": proc("Banana") }),
  });
  const kb = await createFederatedKB({ peers: [home, other] });
  assert.deepEqual((await kb.search("Banana")).hits.map((h) => h.id).sort(), [
    "crm:procedure.a",
    "other:procedure.b",
  ]);
});

test("search applies relevance and goal limits after merging", async () => {
  const home = createPeerService({
    kb: await product("crm", [], {
      "goals/a.md": goal([]).replace("title: G", "title: Banana"),
    }),
  });
  const kb = await createFederatedKB({
    local: await product("x", ["crm"]),
    peers: [home],
  });
  assert.equal(
    (await kb.search("Banana", { minRelevance: 0.95 })).hits.length,
    0,
  );
  assert.equal((await kb.search("Banana", { goalLimit: 0 })).goals.length, 0);
});

test("hops option reaches peers beyond the default two hops", async () => {
  const c = createPeerService({
    kb: await product("c", [], { "procedures/x.md": proc("X") }),
  });
  const b = createPeerService({ kb: await product("b", ["c"]), peers: [c] });
  const a = createPeerService({ kb: await product("a", ["b"]), peers: [b] });
  const kb = await createFederatedKB({
    local: await product("hub", ["a"]),
    peers: [a],
    hops: 3,
  });
  assert.ok((await kb.nodes(["c:procedure.x"])).has("c:procedure.x"));
});

test("peers() honours timeoutMs without a local KB", async () => {
  const slow = createPeerService({ kb: await product("slow") });
  const kb = await createFederatedKB({
    peers: [
      {
        ...slow,
        manifest: () =>
          new Promise((done) => setTimeout(() => done(slow.manifest()), 200)),
      },
    ],
    timeoutMs: 50,
  });
  assert.equal((await kb.peers())[0].ok, false);
});

test("cross-simp refs without peers still warn as unreachable", async () => {
  const local = await product("x", ["crm"], {
    "procedures/send.md": proc("Send", "requires: [crm:procedure.import]\n"),
  });
  const kb = await createFederatedKB({ local });
  assert.ok(
    (await kb.resolveProcedure("procedure.send")).warnings.includes(
      'unreachable node "crm:procedure.import"',
    ),
  );
});

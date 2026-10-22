import test from "node:test";
import assert from "node:assert/strict";
import { product } from "./federation-helpers.js";
import { goal, proc, state, choiceYaml, sig } from "./helpers.js";
import { createPeerService } from "../src/federation/service.js";
import { createFederatedKB } from "../src/federation/kb.js";
import { newTrace } from "../src/federation/protocol.js";

async function integrated(delegate = false) {
  const crm = await product("crm", [], {
    "procedures/import.md": proc(
      "Import",
      "requires: [procedure.login]\nproduces: [state.imported]\n",
    ),
    "procedures/login.md": proc("Login"),
    "states/imported.md": state("Imported", "procedure.import"),
    "goals/import.md": goal(["procedure.import"]),
  });
  if (delegate) crm.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const peer = createPeerService({ kb: crm });
  const x = await product("x", ["crm"], {
    "goals/send.md": goal(["procedure.send"]),
    "procedures/send.md": proc(
      "Send",
      "requires: [crm:procedure.import]\npreconditions: [crm:state.imported]\n",
    ),
  });
  return {
    peer,
    kb: await createFederatedKB({
      local: x,
      peers: [peer],
      modes: { crm: delegate ? "delegate" : "pull" },
    }),
  };
}

test("pull resolves remote goals and cross-product procedures", async () => {
  const { kb } = await integrated();
  assert.deepEqual(
    sig((await kb.resolveGoal("goal.send")).alternatives[0].plan),
    [
      "run:crm:procedure.login",
      "run:crm:procedure.import",
      "run:procedure.send",
    ],
  );
  assert.deepEqual(
    sig((await kb.resolveGoal("crm:goal.import")).alternatives[0].plan),
    ["run:crm:procedure.login", "run:crm:procedure.import"],
  );
});

test("delegated procedure is spliced and produces satisfy later preconditions", async () => {
  const { kb } = await integrated(true);
  assert.deepEqual(
    sig((await kb.resolveGoal("goal.send")).alternatives[0].plan),
    [
      "run:crm:procedure.login",
      "run:crm:procedure.import",
      "run:procedure.send",
    ],
  );
});

test("delegate choices and states pass through with simp prefix stripped", async () => {
  const crm = await product("crm", [], {
    "procedures/import.md": proc(
      "Import",
      choiceYaml("source", [
        ["api", "procedure.api"],
        ["csv", "procedure.csv"],
      ]),
      "1. choice:source",
    ),
    "procedures/api.md": proc(
      "API",
      "preconditions: [state.ready]\nproduces: [state.enabled]\n",
    ),
    "procedures/csv.md": proc("CSV"),
    "states/ready.md": state("Ready", "procedure.csv"),
    "states/enabled.md": state("Enabled", "procedure.api"),
  });
  crm.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const peer = createPeerService({ kb: crm });
  const x = await product("x", ["crm"], {
    "procedures/send.md": proc(
      "Send",
      "requires: [crm:procedure.import]\npreconditions: [crm:state.enabled]\n",
    ),
  });
  const kb = await createFederatedKB({
    local: x,
    peers: [peer],
    modes: { crm: "delegate" },
  });
  const result = await kb.resolveProcedure("procedure.send", {
    choices: { "crm:source": "api" },
    states: { "crm:state.ready": true },
  });
  assert.ok(
    !sig(result.alternatives[0].plan).some((s) => s.startsWith("check:")),
  );
  const first = result.alternatives[0].plan[0];
  assert.equal(first.kind, "run");
  if (first.kind === "run") {
    const choice = first.steps.find((s) => typeof s !== "string");
    assert.ok(
      choice && typeof choice !== "string" && choice.selected === "api",
    );
  }
});

test("service without delegate exposes no resolve", async () => {
  const { peer } = await integrated();
  assert.equal(peer.resolve, undefined);
});

test("service resolves qualified targets through an indirect peer", async () => {
  const { peer: crm } = await integrated(true);
  const yKB = await product("y", ["crm"]);
  yKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const y = createPeerService({ kb: yKB, peers: [crm] });
  const xKB = await product("x", ["y"]);
  xKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const x = createPeerService({ kb: xKB, peers: [y] });
  const result = await x.resolve!({
    target: "crm:procedure.import",
    trace: newTrace(),
  });
  assert.ok(
    sig(result.resolved.alternatives[0].plan).includes(
      "run:crm:procedure.import",
    ),
  );
  assert.ok(result.sources.some((s) => s.simp === "crm" && s.ok));
});

test("delegate timeout falls back to pull without hanging", async () => {
  const { peer } = await integrated(true);
  const slow = { ...peer, resolve: () => new Promise<never>(() => {}) };
  const kb = await createFederatedKB({
    local: await product("x", ["crm"], {
      "procedures/send.md": proc("Send", "requires: [crm:procedure.import]\n"),
    }),
    peers: [slow],
    modes: { crm: "delegate" },
    timeoutMs: 10,
  });
  assert.ok(
    sig(
      (await kb.resolveProcedure("procedure.send")).alternatives[0].plan,
    ).includes("run:crm:procedure.import"),
  );
});

test("resolution does not pull from a peer advertising no modes", async () => {
  const { peer } = await integrated();
  let lookups = 0;
  const disabled = {
    ...peer,
    manifest: async () => ({ ...(await peer.manifest()), serves: [] }),
    lookup: async (...args: Parameters<typeof peer.lookup>) => {
      lookups++;
      return peer.lookup(...args);
    },
  };
  const local = await product("x", ["crm"], {
    "procedures/send.md": proc("Send", "requires: [crm:procedure.import]\n"),
  });
  const kb = await createFederatedKB({ local, peers: [disabled] });
  const result = await kb.resolveProcedure("procedure.send");
  assert.equal(lookups, 0);
  assert.ok(
    !sig(result.alternatives[0].plan).includes("run:crm:procedure.import"),
  );
  local.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  await createPeerService({ kb: local, peers: [disabled] }).resolve!({
    target: "procedure.send",
    trace: newTrace(),
  });
  assert.equal(lookups, 0);
});

test("service delegates once per procedure while deriving guaranteed states", async () => {
  const { peer } = await integrated(true);
  let resolves = 0;
  const tracked = {
    ...peer,
    resolve: async (...args: Parameters<NonNullable<typeof peer.resolve>>) => {
      resolves++;
      return peer.resolve!(...args);
    },
  };
  const local = await product("x", ["crm"], {
    "procedures/send.md": proc("Send", "requires: [crm:procedure.import]\n"),
  });
  local.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  await createPeerService({
    kb: local,
    peers: [tracked],
    modes: { crm: "delegate" },
  }).resolve!({ target: "procedure.send", trace: newTrace() });
  assert.equal(resolves, 1);
});

test("delegated gated procedures retain remote availability warnings", async () => {
  const crm = await product("crm", [], {
    "procedures/main.md": proc(
      "Main",
      "requires: [procedure.inner]\navailability: {plans: [pro]}\n",
    ),
    "procedures/inner.md": proc("Inner", "availability: {plans: [pro]}\n"),
  });
  crm.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const peer = createPeerService({ kb: crm });
  const direct = await peer.resolve!({
    target: "procedure.main",
    trace: newTrace(),
  });
  assert.ok(
    direct.resolved.warnings.includes(
      "availability of procedure.main not checked",
    ),
  );
  assert.ok(
    direct.resolved.warnings.includes(
      "availability of procedure.inner not checked",
    ),
  );
  const local = await product("x", ["crm"], {
    "procedures/send.md": proc("Send", "requires: [crm:procedure.main]\n"),
  });
  const kb = await createFederatedKB({
    local,
    peers: [peer],
    modes: { crm: "delegate" },
  });
  const result = await kb.resolveProcedure("procedure.send");
  assert.ok(
    result.warnings.includes("availability of crm:procedure.main not checked"),
  );
  assert.ok(
    result.warnings.includes("availability of crm:procedure.inner not checked"),
  );
});

test("service forwarding localizes owner state and choice keys through intermediate peers", async () => {
  const crmKB = await product("crm", [], {
    "procedures/main.md": proc(
      "Main",
      "preconditions: [state.ready]\n" +
        choiceYaml("source", [
          ["api", "procedure.api"],
          ["csv", "procedure.csv"],
        ]),
      "1. choice:source",
    ),
    "procedures/api.md": proc("API"),
    "procedures/csv.md": proc("CSV"),
    "states/ready.md": state("Ready", "procedure.api"),
  });
  crmKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const crm = createPeerService({ kb: crmKB });
  const yKB = await product("y", ["crm"]);
  yKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const y = createPeerService({ kb: yKB, peers: [crm] });
  const xKB = await product("x", ["y"]);
  xKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const x = createPeerService({ kb: xKB, peers: [y] });
  const result = await x.resolve!({
    target: "crm:procedure.main",
    states: { "crm:state.ready": true },
    choices: { "crm:source": "api" },
    trace: newTrace(),
  });
  const plan = result.resolved.alternatives[0].plan;
  assert.ok(!plan.some((s) => s.kind === "check"));
  const run = plan.find(
    (s) => s.kind === "run" && s.procedure.id === "crm:procedure.main",
  );
  assert.ok(
    run?.kind === "run" &&
      run.steps.some((s) => typeof s !== "string" && s.selected === "api"),
  );
});

test("forwarding does not reuse caller-local states or choices in another simp", async () => {
  const crmKB = await product("crm", [], {
    "procedures/main.md": proc(
      "Main",
      "preconditions: [state.ready]\n" +
        choiceYaml("source", [
          ["api", "procedure.api"],
          ["csv", "procedure.csv"],
        ]),
      "1. choice:source",
    ),
    "procedures/api.md": proc("API"),
    "procedures/csv.md": proc("CSV"),
    "states/ready.md": state("Ready", "procedure.csv"),
  });
  crmKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const crm = createPeerService({ kb: crmKB });
  const xKB = await product("x", ["crm"]);
  xKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const x = createPeerService({
    kb: xKB,
    peers: [crm],
    modes: { crm: "delegate" },
  });
  const result = await x.resolve!({
    target: "crm:procedure.main",
    states: { "state.ready": true },
    choices: { source: "api", "procedure.main:source": "api" },
    trace: newTrace(),
  });
  const plan = result.resolved.alternatives[0].plan;
  assert.ok(
    plan.some((s) => s.kind === "check" && s.state.id === "crm:state.ready"),
  );
  const run = plan.find(
    (s) => s.kind === "run" && s.procedure.id === "crm:procedure.main",
  );
  assert.ok(
    run?.kind === "run" &&
      run.steps.some((s) => typeof s !== "string" && !s.selected),
  );
});

test("delegate service warns for gated capabilities", async () => {
  const crmKB = await product("crm", [], {
    "procedures/main.md": proc("Main", "uses: [capability.api]\n"),
    "capabilities/api.md":
      "---\ntype: capability\ntitle: API\nsummary: API\navailability: {plans: [pro]}\n---\n",
  });
  crmKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const crm = createPeerService({ kb: crmKB });
  const result = await crm.resolve!({
    target: "procedure.main",
    trace: newTrace(),
  });
  assert.ok(
    result.resolved.warnings.includes(
      "availability of capability.api not checked",
    ),
  );
});

test("service does not delegate to an owner that only serves pull", async () => {
  const { peer: crm } = await integrated();
  let delegated = false;
  const xKB = await product("x", ["crm"]);
  xKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const x = createPeerService({
    kb: xKB,
    peers: [
      {
        ...crm,
        resolve: async () => {
          delegated = true;
          throw new Error("does not serve delegate");
        },
      },
    ],
  });
  const result = await x.resolve!({
    target: "crm:procedure.import",
    trace: newTrace(),
  });
  assert.equal(delegated, false);
  assert.ok(!result.sources.some((s) => !s.ok));
});

test("service resolve looks up each remote node once", async () => {
  const { peer: crm } = await integrated();
  const looked: string[] = [];
  const xKB = await product("x", ["crm"], {
    "procedures/send.md": proc("Send", "requires: [crm:procedure.import]\n"),
  });
  xKB.graph.nodes.get("simp")!.data.serves = ["pull", "delegate"];
  const x = createPeerService({
    kb: xKB,
    peers: [
      {
        ...crm,
        lookup: (r) => {
          looked.push(...r.ids);
          return crm.lookup(r);
        },
      },
    ],
  });
  await x.resolve!({ target: "procedure.send", trace: newTrace() });
  assert.ok(looked.includes("procedure.import"));
  assert.deepEqual(looked, [...new Set(looked)]);
});

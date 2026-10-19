import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { lintKB, renderResolvedGoal, resolveGoal } from "../src/index.js";
import { fixture as lintFixture, proc, sig } from "./helpers.js";

const SAMPLE = path.resolve("kb");
const GOAL = "goal.send-zalo-broadcast";

async function sampleGraph() {
  const { graph, errorCount } = await lintKB(SAMPLE);
  assert.equal(errorCount, 0);
  return graph;
}

test("unknown precondition → check + conditional fix + main", async () => {
  const r = resolveGoal(await sampleGraph(), GOAL, { tenant: { plan: "pro" } });
  const best = r.alternatives[0];
  assert.equal(best.procedure.id, "procedure.broadcast.send-zalo");
  assert.deepEqual(sig(best.plan), [
    "check:state.channel.zalo-connected",
    "run:procedure.channel.connect-zalo?state.channel.zalo-connected",
    "run:procedure.broadcast.send-zalo",
  ]);
});

test("known true precondition is skipped and reported", async () => {
  const r = resolveGoal(await sampleGraph(), GOAL, {
    tenant: { plan: "pro" },
    states: { "state.channel.zalo-connected": true },
  });
  assert.deepEqual(sig(r.alternatives[0].plan), ["run:procedure.broadcast.send-zalo"]);
  assert.deepEqual(r.alternatives[0].satisfiedStates, ["state.channel.zalo-connected"]);
});

test("known false precondition → unconditional fix, no check", async () => {
  const r = resolveGoal(await sampleGraph(), GOAL, {
    tenant: { plan: "pro" },
    states: { "state.channel.zalo-connected": false },
  });
  assert.deepEqual(sig(r.alternatives[0].plan), ["run:procedure.channel.connect-zalo", "run:procedure.broadcast.send-zalo"]);
});

test("ranking: gated alternative is unavailable for pro, null without tenant", async () => {
  const g = await sampleGraph();
  const pro = resolveGoal(g, GOAL, { tenant: { plan: "pro" } });
  const api = pro.alternatives.find((a) => a.procedure.id.endsWith("send-zalo-api"))!;
  assert.equal(api.rank, 2);
  assert.equal(api.available, false);
  assert.ok(api.unavailableReasons.some((r) => r.includes("plan: enterprise")));

  const none = resolveGoal(g, GOAL);
  assert.equal(none.alternatives.find((a) => a.procedure.id.endsWith("send-zalo-api"))!.available, null);
  assert.ok(none.alternatives.every((a) => a.available === null)); // both are plan-gated
});

async function fixture(files: Record<string, string>) {
  const { graph, issues } = await lintFixture(files);
  assert.deepEqual(issues.filter((i) => i.severity === "error"), []);
  return graph;
}

test("requires ordering, dedupe, produces short-circuit, conditional upgrade", async () => {
  const g = await fixture({
    "goals/g.md": "---\ntype: goal\ntitle: G\nsummary: g\naliases: [g]\nwhen_to_use: [g]\nprocedures: [procedure.main]\n---\n",
    // main requires a, then b. a needs state s (unknown) fixed by x → x conditional.
    // b requires x → x must be upgraded to unconditional.
    "procedures/main.md": proc("main", "requires: [procedure.a, procedure.b]\npreconditions: [state.s]\n"),
    "procedures/a.md": proc("a", "preconditions: [state.s]\n"),
    "procedures/b.md": proc("b", "requires: [procedure.x]\n"),
    "procedures/x.md": proc("x", "produces: [state.s]\n"),
    "states/s.md": "---\ntype: state\ntitle: S\nsummary: s\ncheck: look\nsatisfied_by: [procedure.x]\n---\n",
  });
  const plan = resolveGoal(g, "goal.g").alternatives[0].plan;
  assert.deepEqual(sig(plan), [
    "check:state.s",
    "run:procedure.x", // upgraded: condition removed
    "run:procedure.a",
    "run:procedure.b",
    "run:procedure.main", // state.s already checked/produced → no second check
  ]);
});

test("renderer keeps priority-0 sections and trims the rest in priority order", async () => {
  const r = resolveGoal(await sampleGraph(), GOAL, { tenant: { plan: "pro" } });
  const full = renderResolvedGoal(r, { tokenBudget: 5000 });
  assert.deepEqual(full.omitted, []);
  const tight = renderResolvedGoal(r, { tokenBudget: 50 });
  assert.match(tight.text, /### Plan/);
  assert.match(tight.text, /\[blocking\]/);
  assert.deepEqual(tight.omitted, ["alternatives", "capabilities", "failure-handling"]);
});

test("non-goal id throws", async () => {
  assert.throws(() => resolveGoal({ nodes: new Map(), edges: [], out: new Map(), in: new Map() }, "procedure.x"), /not a goal/);
});

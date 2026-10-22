import test from "node:test";
import assert from "node:assert/strict";
import {
  selectMode,
  guaranteedStates,
  fragmentNode,
  spliceFragments,
} from "../src/federation/prefetch.js";
import { buildGraph } from "../src/graph.js";
import type { Alternative, ResolvedGoal, RunStep } from "../src/resolve.js";
import type { ResolveResponse } from "../src/federation/protocol.js";

const ref = (id: string) => ({ id, title: id, summary: id });
const run = (id: string): RunStep => ({
  kind: "run",
  procedure: ref(id),
  reason: "main",
  steps: [],
});
const alt = (plan: Alternative["plan"]): Alternative => ({
  rank: 1,
  procedure: ref("procedure.import"),
  deprecated: false,
  plan,
  capabilities: [],
  constraints: [],
  satisfiedStates: [],
  warnings: [],
  available: true,
  unavailableReasons: [],
});
const resolved = (a: Alternative): ResolvedGoal => ({
  subject: "procedure",
  goal: { ...a.procedure, whenToUse: [] },
  alternatives: [a],
  warnings: [],
});

test("selectMode respects advertised modes", () => {
  assert.equal(selectMode("delegate", ["pull", "delegate"]), "delegate");
  assert.equal(selectMode("delegate", ["pull"]), "pull");
  assert.equal(selectMode(undefined, ["delegate"]), "delegate");
  assert.equal(selectMode("pull", []), undefined);
});
test("conditional side effects are not guaranteed", () => {
  const response: ResolveResponse = {
    resolved: resolved(alt([])),
    produces: ["state.connected", "state.synced"],
    sources: [],
  };
  const graph = buildGraph(
    new Map([["procedure.fix", fragmentNode("procedure.fix", response)]]),
  );
  const fix = {
    ...run("procedure.fix"),
    when: [{ state: "state.connected", is: false as const }],
  };
  assert.deepEqual(guaranteedStates(alt([fix]), graph), ["state.connected"]);
});

test("nested conditional fixes do not guarantee states behind another condition", () => {
  const response: ResolveResponse = {
    resolved: resolved(alt([])),
    produces: ["state.b"],
    sources: [],
  };
  const graph = buildGraph(
    new Map([["procedure.fix-b", fragmentNode("procedure.fix-b", response)]]),
  );
  const fix = {
    ...run("procedure.fix-b"),
    when: [
      { state: "state.a", is: false as const },
      { state: "state.b", is: false as const },
    ],
  };
  assert.deepEqual(guaranteedStates(alt([fix]), graph), []);
});
test("selected choice does not guarantee conditional side effects", () => {
  const response: ResolveResponse = {
    resolved: resolved(alt([])),
    produces: ["state.synced"],
    sources: [],
  };
  const graph = buildGraph(
    new Map([["procedure.sync", fragmentNode("procedure.sync", response)]]),
  );
  const parent = {
    ...run("procedure.fix"),
    when: [{ state: "state.connected", is: false as const }],
  };
  parent.steps.push({
    kind: "choose",
    choice: "source",
    question: "Source?",
    selected: "api",
    options: [
      {
        key: "api",
        when: "API",
        procedure: ref("procedure.sync"),
        plan: [run("procedure.sync")],
        capabilities: [],
        constraints: [],
        warnings: [],
        available: true,
        unavailableReasons: [],
      },
    ],
  });
  assert.deepEqual(guaranteedStates(alt([parent]), graph), []);
});
test("spliced steps keep inner and outer conditions", () => {
  const inner = {
    ...run("crm:procedure.fix"),
    when: [{ state: "crm:state.connected", is: false as const }],
  };
  const response: ResolveResponse = {
    resolved: resolved(alt([inner])),
    produces: [],
    sources: [],
  };
  const outer = {
    ...run("crm:procedure.import"),
    when: [{ state: "state.ready", is: false as const }],
  };
  const result = spliceFragments(
    resolved(alt([outer])),
    new Map([["crm:procedure.import", response]]),
  );
  assert.deepEqual(result.alternatives[0].plan[0].when, [
    ...outer.when,
    ...inner.when,
  ]);
});

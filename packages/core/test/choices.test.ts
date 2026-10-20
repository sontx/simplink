import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lintKB,
  resolveGoal,
  renderResolvedGoal,
  type ChooseStep,
  type RunStep,
} from "../src/index.js";
import { choiceYaml, fixture, goal, proc, sig, state } from "./helpers.js";

const GOAL = "goal.send-zalo-message";
const sample = async () => {
  const r = await lintKB(
    fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
  );
  assert.equal(r.errorCount, 0);
  return r.graph;
};
const mainRun = (plan: unknown[]) =>
  (plan as RunStep[]).find((s) => s.kind === "run" && s.reason === "main")!;
const chooseOf = (run: RunStep) =>
  run.steps.find((s): s is ChooseStep => typeof s !== "string")!;

test("no selection → choose step at its position, every option expanded", async () => {
  const r = resolveGoal(await sample(), GOAL, { tenant: { plan: "pro" } });
  const best = r.alternatives[0];
  const run = mainRun(best.plan);
  assert.equal(run.steps.indexOf(chooseOf(run)), 1); // "choice:recipient" is step 2
  const c = chooseOf(run);
  assert.equal(c.selected, undefined);
  assert.deepEqual(
    c.options.map((o) => [o.key, o.available]),
    [
      ["uid", true],
      ["phone", false],
    ],
  );
  assert.deepEqual(sig(c.options[0].plan), [
    "check:state.zalo.recipients-follow-oa",
    "run:procedure.zalo.request-follow?state.zalo.recipients-follow-oa",
    "run:procedure.zalo.deliver-by-uid",
  ]);
  assert.equal(best.available, true); // one usable option is enough
});

test("pre-selected option → only that branch; its availability applies to the alternative", async () => {
  const g = await sample();
  const phone = resolveGoal(g, GOAL, {
    tenant: { plan: "pro" },
    choices: { recipient: "phone" },
  }).alternatives[0];
  const c = chooseOf(mainRun(phone.plan));
  assert.equal(c.selected, "phone");
  assert.deepEqual(
    c.options.map((o) => o.key),
    ["phone"],
  );
  assert.equal(phone.available, false);

  // Qualified key form works too.
  const uid = resolveGoal(g, GOAL, {
    tenant: { plan: "pro" },
    choices: { "procedure.zalo.send-message:recipient": "uid" },
  });
  assert.equal(chooseOf(mainRun(uid.alternatives[0].plan)).selected, "uid");
});

test("unknown option key → warning, all options shown", async () => {
  const a = resolveGoal(await sample(), GOAL, { choices: { recipient: "fax" } })
    .alternatives[0];
  assert.equal(chooseOf(mainRun(a.plan)).options.length, 2);
  assert.ok(a.warnings.some((w) => w.includes('no option "fax"')));
});

test("all options unavailable → alternative unavailable", async () => {
  const { graph } = await fixture({
    "goals/g.md": goal(["procedure.main"]),
    "procedures/main.md": proc(
      "main",
      choiceYaml("c", [
        ["a", "procedure.a"],
        ["b", "procedure.b"],
      ]),
      "1. choice:c",
    ),
    "procedures/a.md": proc("a", "availability: { plans: [ent] }\n"),
    "procedures/b.md": proc("b", "availability: { plans: [ent] }\n"),
  });
  const alt = resolveGoal(graph, "goal.g", { tenant: { plan: "free" } })
    .alternatives[0];
  assert.equal(alt.available, false);
  assert.ok(
    alt.unavailableReasons.includes('no available option for choice "c"'),
  );
});

test("optional precondition → advisory only; known true → satisfied", async () => {
  const g = await sample();
  const run = mainRun(resolveGoal(g, GOAL).alternatives[0].plan);
  assert.deepEqual(
    run.optional?.map((o) => [o.state.id, o.fix]),
    [["state.audience.segment-created", "procedure.audience.create-segment"]],
  );
  const all = JSON.stringify(resolveGoal(g, GOAL).alternatives[0].plan);
  assert.ok(!all.includes('"id":"procedure.audience.create-segment","title"')); // never added as a run step

  const known = resolveGoal(g, GOAL, {
    states: { "state.audience.segment-created": true },
  }).alternatives[0];
  assert.equal(mainRun(known.plan).optional, undefined);
  assert.ok(known.satisfiedStates.includes("state.audience.segment-created"));
});

const postChoiceKB = (bProduces: boolean) => ({
  "goals/g.md": goal(["procedure.second"]),
  "procedures/second.md": proc(
    "second",
    "requires: [procedure.first]\npreconditions: [state.t]\n",
  ),
  "procedures/first.md": proc(
    "first",
    choiceYaml("c", [
      ["a", "procedure.a"],
      ["b", "procedure.b"],
    ]),
    "1. choice:c",
  ),
  "procedures/a.md": proc("a", "produces: [state.t]\n"),
  "procedures/b.md": proc("b", bProduces ? "produces: [state.t]\n" : ""),
  "procedures/fix.md": proc("fix", "produces: [state.t]\n"),
  "states/t.md": state("T", "procedure.fix"),
});

test("state produced in every branch holds after the choice", async () => {
  const { graph } = await fixture(postChoiceKB(true));
  assert.deepEqual(sig(resolveGoal(graph, "goal.g").alternatives[0].plan), [
    "run:procedure.first",
    "run:procedure.second",
  ]);
});

test("state produced in only one branch is still unknown after the choice", async () => {
  const { graph } = await fixture(postChoiceKB(false));
  assert.deepEqual(sig(resolveGoal(graph, "goal.g").alternatives[0].plan), [
    "run:procedure.first",
    "check:state.t",
    "run:procedure.fix?state.t",
    "run:procedure.second",
  ]);
});

test("lint: E014, E015, W108, and cycles through choices", async () => {
  const { issues } = await fixture({
    "goals/g.md": goal(["procedure.main"]),
    "procedures/main.md": proc(
      "main",
      `choices:\n  - id: c\n    question: q\n    options:\n      - { key: a, when: w, procedure: procedure.a }\n      - { key: a, when: w, procedure: procedure.a }\n  - id: solo\n    question: q\n    options:\n      - { key: x, when: w, procedure: procedure.a }\n`,
      "1. choice:solo\n2. choice:ghost",
    ),
    "procedures/a.md": proc("a", "requires: [procedure.main]\n"),
  });
  const codes = issues.map((i) => `${i.code}:${i.message}`);
  const has = (code: string, text: string) =>
    assert.ok(
      codes.some((c) => c.startsWith(code) && c.includes(text)),
      `${code} ${text}\n${codes.join("\n")}`,
    );
  has("E014", 'choice "c" must be referenced exactly once');
  has("E014", 'unknown choice "ghost"');
  has("E015", 'duplicate option key "a"');
  has("W108", 'choice "solo" has only one option');
  has("E009", "dependency cycle");
});

test("renderer shows CHOOSE with nested option plans and optional notes", async () => {
  const text = renderResolvedGoal(
    resolveGoal(await sample(), GOAL, { tenant: { plan: "pro" } }),
    { tokenBudget: 5000 },
  ).text;
  assert.match(text, /\*\*CHOOSE\*\* `recipient`/);
  assert.match(text, /- \*\*uid\*\*: .* — available/);
  assert.match(text, /- \*\*phone\*\*: .* — unavailable/);
  assert.match(text, /_Optional:_ `state.audience.segment-created`/);
});

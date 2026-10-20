import { test } from "node:test";
import assert from "node:assert/strict";
import { createKB, memorySource, renderPlanSteps } from "../src/index.js";
import { goal, proc, state, choiceYaml } from "./helpers.js";

test("plan reference formatter reaches checks, conditions, fixes and nested branches without replacing authored text", async () => {
  const kb = await createKB(
    memorySource({
      "goals/g.md": goal(["procedure.a"]),
      "procedures/a.md": proc(
        "A",
        "preconditions: [state.s]\noptional_preconditions: [state.optional]\n" +
          choiceYaml("pick", [["b", "procedure.b"]]),
        "1. choice:pick\n2. Keep `procedure.a` literal",
      ),
      "procedures/b.md": proc("B", "constrained_by: [constraint.c]\n"),
      "procedures/fix.md": proc("Fix"),
      "states/s.md": state("S", "procedure.fix"),
      "states/optional.md": state("Optional", "procedure.fix"),
      "constraints/c.md":
        "---\ntype: constraint\ntitle: C\nsummary: C\nseverity: blocking\n---",
    }),
  );
  const plan = kb.resolveGoal("goal.g").alternatives[0].plan;
  const ordinary = renderPlanSteps(plan);
  assert.ok(ordinary.includes("**CHECK** `state.s`"));
  assert.ok(ordinary.includes("**RUN** `procedure.a`"));
  assert.equal(
    renderPlanSteps(plan, "", (id) => `\`${id}\``),
    ordinary,
  );
  const formatted = renderPlanSteps(plan, "", (id) => `<${id}>`);
  for (const id of [
    "state.s",
    "procedure.fix",
    "procedure.a",
    "procedure.b",
    "state.optional",
    "constraint.c",
  ])
    assert.ok(formatted.includes(`<${id}>`), id);
  assert.ok(formatted.includes("Keep `procedure.a` literal"));
  assert.ok(formatted.includes("<state.s> is false"));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  groupState,
  relationshipGroups,
  toggleGroup,
} from "../src/lib/relationship-groups.js";

test("relationship groups keep only kinds present and collect unknown kinds under Other", () => {
  const groups = relationshipGroups(["related", "requires", "future_kind"]);
  assert.deepEqual(
    groups.map((group) => [group.key, group.kinds]),
    [
      ["steps", ["requires"]],
      ["links", ["related"]],
      ["other", ["future_kind"]],
    ],
  );
});

test("a group checkbox is on, mixed, or off, and toggling fills or clears it", () => {
  const kinds = ["procedures", "requires"];
  assert.equal(groupState(kinds, ["procedures", "requires", "related"]), true);
  assert.equal(groupState(kinds, ["requires"]), "indeterminate");
  assert.equal(groupState(kinds, ["related"]), false);
  assert.deepEqual(toggleGroup(kinds, ["procedures", "requires", "related"]), [
    "related",
  ]);
  assert.deepEqual(toggleGroup(kinds, ["requires", "related"]), [
    "requires",
    "related",
    "procedures",
  ]);
});

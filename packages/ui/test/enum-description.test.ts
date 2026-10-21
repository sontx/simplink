import assert from "node:assert/strict";
import test from "node:test";
import { EDGE_KINDS, NODE_TYPES } from "@sontx/simplink-core";
import { enumDescription } from "../src/lib/enum-description.js";

test("every KB enum has a short explanation", () => {
  for (const value of [
    ...NODE_TYPES,
    ...EDGE_KINDS,
    "active",
    "deprecated",
    "blocking",
    "warning",
    "error",
  ]) {
    assert.ok(enumDescription(value), `Missing description for ${value}`);
  }
});

test("warnings explain constraints and validation issues separately", () => {
  assert.equal(
    enumDescription("warning"),
    "A constraint to consider before proceeding.",
  );
  assert.equal(
    enumDescription("warning", "issue"),
    "A potential problem that should be reviewed.",
  );
  assert.equal(enumDescription("toString"), undefined);
  assert.equal(enumDescription("unknown"), undefined);
});

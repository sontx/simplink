import assert from "node:assert/strict";
import test from "node:test";
import { ISSUE_CODES, issueCodeMeaning } from "../src/lib/issue-codes.js";

test("every built-in lint code has an English meaning and a Vietnamese translation", () => {
  for (const code of ISSUE_CODES) {
    const english = issueCodeMeaning(code);
    assert.ok(english, code);
    assert.notEqual(issueCodeMeaning(code, "vi"), english, code);
  }
});

test("custom rule codes have no meaning", () => {
  assert.equal(issueCodeMeaning("X900"), undefined);
  assert.equal(issueCodeMeaning("toString"), undefined);
});

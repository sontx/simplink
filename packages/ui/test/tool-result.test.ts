import test from "node:test";
import assert from "node:assert/strict";
import { readToolResult } from "../src/lib/tool-result.js";

test("playground separates the MCP lint warning without altering JSON or Markdown", () => {
  const warning = "[KB has 2 lint error(s); results may be incomplete]";
  for (const content of ['{"hits":[]}', "# Plan\n\n1. Check"]) {
    assert.deepEqual(readToolResult({ content }), { content });
    assert.deepEqual(readToolResult({ content: `${warning}\n${content}` }), {
      content,
      warning,
    });
  }
  assert.deepEqual(readToolResult({ content: "[ordinary Markdown]\nText" }), {
    content: "[ordinary Markdown]\nText",
  });
});

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as posix from "../src/posix-path.js";

test("portable paths match POSIX dirname, basename and relative", () => {
  for (const value of ["", ".", "a", "a/b.md", "/a/b/", "a//b", "/"]) {
    assert.equal(posix.dirname(value), path.posix.dirname(value));
    assert.equal(posix.basename(value), path.posix.basename(value));
  }
  for (const [from, to] of [
    [".", "a.md"],
    ["guides/how-to", "reference/rules.md"],
    ["a/b", "a/b"],
    ["a/../b", "a/c"],
    ["/a", "/b/c"],
  ]) {
    assert.equal(posix.relative(from, to), path.posix.relative(from, to));
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { lintKB, locateSource, memorySource } from "../src/index.js";

const doc = [
  "---", // 1
  "type: procedure", // 2
  "title: Send", // 3
  "aliases: [send, push]", // 4
  "availability:", // 5
  "  plans:", // 6
  "    - pro", // 7
  "    - team", // 8
  "  permissions: [send]", // 9
  "requires:", // 10
  "- capability.a", // 11
  "- capability.b", // 12
  "choices:", // 13
  "  - id: channel", // 14
  "    options:", // 15
  "      - key: zalo", // 16
  "  - id: tone", // 17
  "---", // 18
  "", // 19
  "## Steps", // 20
  "1. Go [[capability.a]]", // 21
].join("\n");

test("locator finds block YAML fields, items, and nested keys by path", () => {
  const source = locateSource(doc);
  assert.equal(source.field(["title"]), 3);
  assert.equal(source.field(["availability", "plans"]), 6);
  assert.equal(source.field(["availability", "plans", 1]), 8);
  assert.equal(source.field(["availability", "permissions"]), 9);
  // List items may sit at the key's own column.
  assert.equal(source.field(["requires", 1]), 12);
  assert.equal(source.field(["choices", 1]), 17);
  assert.equal(source.field(["choices", 0, "options", 0, "key"]), 16);
  assert.equal(source.field(["choices", 1, "id"]), 17);
});

test("locator falls back to the deepest found key and reports absent keys as undefined", () => {
  const source = locateSource(doc);
  // Flow sequences have no item lines.
  assert.equal(source.field(["aliases", 1]), 4);
  assert.equal(source.field(["availability", "missing"]), 5);
  assert.equal(source.field(["summary"]), undefined);
  assert.equal(source.field(["requires", 9]), 10);
});

test("locator searches frontmatter and body text separately", () => {
  const source = locateSource(doc);
  assert.equal(source.frontmatterText("capability.b"), 12);
  assert.equal(source.bodyText("[[capability.a"), 21);
  assert.equal(source.bodyText("capability.b"), undefined);
  assert.equal(locateSource("no frontmatter\nline").bodyText("line"), 2);
  assert.equal(locateSource("no frontmatter").field(["type"]), undefined);
  const bom = String.fromCharCode(0xfeff);
  assert.equal(locateSource(`${bom}---\ntype: goal\n---\n`).field(["type"]), 2);
});

test("lint diagnostics carry the source line they point at", async () => {
  const { issues } = await lintKB(
    memorySource({
      "goals/a.md": [
        "---",
        "type: goal",
        "title: A",
        "summary: A goal",
        "aliases: [a]",
        "status: retired",
        "procedures:",
        "  - procedure.missing",
        "---",
        "Body with [[capability.gone]].",
      ].join("\n"),
      "goals/b.md": ["---", "type: goal", "title: [unclosed", "---"].join("\n"),
      "goals/c.md": ["---", "type: goal", "title: C", "---"].join("\n"),
    }),
  );
  const at = (path: string, code: string) =>
    issues
      .filter((i) => i.path === path && i.code === code)
      .map((i) => [i.message, i.line]);
  assert.deepEqual(at("goals/a.md", "E007"), [
    ['procedures → "procedure.missing" does not exist', 8],
    ["[[capability.gone]] does not exist", 10],
  ]);
  assert.equal(at("goals/a.md", "E012")[0][1], 6);
  // YAML errors report the file line; an unclosed collection ends at the fence.
  assert.equal(at("goals/b.md", "E013")[0][1], 4);
  // A missing root field has no line to point at.
  assert.deepEqual(
    issues.find((i) => i.path === "goals/c.md" && i.code === "E006"),
    {
      code: "E006",
      severity: "error",
      path: "goals/c.md",
      message: 'missing required field "summary"',
    },
  );
});

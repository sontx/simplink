import assert from "node:assert/strict";
import test from "node:test";
import type { Issue } from "@sontx/simplink-core";
import { groupIssuesByFile, nextFileWithIssues } from "../src/lib/issues.js";

const issue = (path: string, code: string): Issue => ({
  path,
  code,
  severity: code.startsWith("E") ? "error" : "warning",
  message: `${code} in ${path}`,
});

const nodes = [
  { path: "goals/a.md", id: "goal.a" },
  { path: "goals/b.md", id: "goal.b" },
  { path: "goals/c.md", id: "goal.c" },
];

test("issues group by file with the most errors first and errors before warnings", () => {
  const groups = groupIssuesByFile(
    [
      issue("goals/a.md", "W001"),
      issue("goals/b.md", "W002"),
      issue("goals/b.md", "E002"),
      issue("goals/c.md", "E001"),
      issue("goals/c.md", "E003"),
      issue("broken.md", "W004"),
    ],
    nodes,
  );
  assert.deepEqual(
    groups.map((group) => [group.path, group.errors, group.warnings]),
    [
      ["goals/c.md", 2, 0],
      ["goals/b.md", 1, 1],
      ["broken.md", 0, 1],
      ["goals/a.md", 0, 1],
    ],
  );
  assert.deepEqual(
    groups[1].issues.map((i) => i.code),
    ["E002", "W002"],
  );
  assert.equal(groups[0].node?.id, "goal.c");
  assert.equal(groups[2].node, undefined);
});

test("next file with issues skips files without nodes and wraps around", () => {
  const groups = groupIssuesByFile(
    [
      issue("goals/a.md", "E001"),
      issue("broken.md", "E002"),
      issue("goals/b.md", "W001"),
    ],
    nodes,
  );
  assert.deepEqual(
    (({ next, position, total }) => [next?.path, position, total])(
      nextFileWithIssues(groups, "goals/a.md"),
    ),
    ["goals/b.md", 1, 2],
  );
  assert.equal(
    nextFileWithIssues(groups, "goals/b.md").next?.path,
    "goals/a.md",
  );
  const fromClean = nextFileWithIssues(groups, "goals/c.md");
  assert.equal(fromClean.next?.path, "goals/a.md");
  assert.equal(fromClean.position, 0);
  const alone = groupIssuesByFile([issue("goals/a.md", "E001")], nodes);
  assert.equal(nextFileWithIssues(alone, "goals/a.md").next, undefined);
});

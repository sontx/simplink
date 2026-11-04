import assert from "node:assert/strict";
import test from "node:test";
import type { Issue } from "@sontx/simplink-core";
import {
  clearedIssues,
  groupIssuesByFile,
  issueQueue,
  nextIssue,
} from "../src/lib/issues.js";

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

test("next issue steps through each file's issues, skips files without nodes, and wraps", () => {
  const queue = issueQueue(
    groupIssuesByFile(
      [
        issue("goals/a.md", "E001"),
        issue("goals/a.md", "W003"),
        issue("broken.md", "E002"),
        issue("goals/b.md", "W001"),
      ],
      nodes,
    ),
  );
  const step = (path: string, index: number) =>
    (({ next, position, total }) => [
      next?.file.path,
      next?.index,
      position,
      total,
    ])(nextIssue(queue, path, index));
  assert.deepEqual(step("goals/a.md", 0), ["goals/a.md", 1, 2, 3]);
  assert.deepEqual(step("goals/a.md", 1), ["goals/b.md", 0, 3, 3]);
  assert.deepEqual(step("goals/b.md", 0), ["goals/a.md", 0, 1, 3]);
  assert.deepEqual(step("goals/c.md", 0), ["goals/a.md", 0, 1, 3]);
  const alone = issueQueue(
    groupIssuesByFile([issue("goals/a.md", "E001")], nodes),
  );
  assert.equal(nextIssue(alone, "goals/a.md", 0).next, undefined);
  assert.equal(nextIssue([], "goals/a.md", 0).next, undefined);
});

test("files that never became nodes open under the id their path derives", () => {
  const groups = groupIssuesByFile(
    [
      issue("goals/typo.md", "E013"),
      issue("goals/nested/index.md", "E013"),
      issue("simp.md", "E013"),
      issue("notes/readme.md", "E001"),
      // A node declaring id goal.custom in another file owns that id.
      issue("goals/custom.md", "E013"),
      issue("goals/a.md", "W001"),
    ],
    [...nodes, { path: "goals/other.md", id: "goal.custom" }],
  );
  const byPath = Object.fromEntries(
    groups.map((group) => [group.path, [group.id, group.type]]),
  );
  assert.deepEqual(byPath["goals/typo.md"], ["goal.typo", "goal"]);
  assert.deepEqual(byPath["goals/nested/index.md"], [
    "goal.nested.index",
    "goal",
  ]);
  assert.deepEqual(byPath["simp.md"], [undefined, undefined]);
  assert.deepEqual(byPath["notes/readme.md"], [undefined, undefined]);
  assert.equal(byPath["goals/custom.md"][0], undefined);
  assert.equal(byPath["goals/a.md"][0], "goal.a");
  assert.deepEqual(
    issueQueue(groups).map((item) => item.file.path),
    ["goals/nested/index.md", "goals/typo.md", "goals/a.md"],
  );
});

test("cleared issues are the ones a save removed, counting duplicates", () => {
  const before = [
    issue("goals/a.md", "E001"),
    issue("goals/a.md", "W002"),
    issue("goals/a.md", "W002"),
  ];
  assert.deepEqual(
    clearedIssues(before, [issue("goals/a.md", "W002")]).map((i) => i.code),
    ["E001", "W002"],
  );
  assert.deepEqual(clearedIssues(before, before), []);
  // Broken YAML hides the other issues rather than fixing them.
  assert.deepEqual(clearedIssues(before, [issue("goals/a.md", "E013")]), []);
  assert.deepEqual(
    clearedIssues([issue("goals/a.md", "E013")], []).map((i) => i.code),
    ["E013"],
  );
});

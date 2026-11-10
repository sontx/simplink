import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildSimpIndex,
  formatSimpSources,
  fsSource,
  lintKB,
  memorySource,
  parseSimpSources,
  SIMP_SOURCES_FILE,
} from "../src/index.js";
import { fixture, goal, proc } from "./helpers.js";

const manifest =
  "---\ntype: simp\nname: crm\ntitle: CRM\nsummary: Customers\n---\n";

test("formats sources with sorted keys and parses them back", () => {
  const sources = {
    "procedure.b": ["src/b.ts"],
    simp: ["README.md"],
    "goal.a": ["src/a.ts", "https://docs.example/a#intro"],
  };
  const text = formatSimpSources(sources);
  assert.deepEqual(
    text.split("\n").filter((l) => !l.startsWith(" ") && l),
    ["goal.a:", "procedure.b:", "simp:"],
  );
  assert.deepEqual(parseSimpSources(text), sources);
  assert.deepEqual(parseSimpSources(""), {});
  assert.equal(formatSimpSources({}), "{}\n");
});

test("rejects malformed sources files", () => {
  for (const text of [
    "- src/a.ts\n",
    "goal: [src/a.ts]\n",
    "crm:goal.a: [src/a.ts]\n",
    "goal.A: [src/a.ts]\n",
    "goal.a: src/a.ts\n",
    "goal.a: []\n",
    'goal.a: [""]\n',
    "goal.a: [1]\n",
    "goal.a: [\n",
  ])
    assert.throws(
      () => parseSimpSources(text),
      /^Error: invalid sources:/,
      text,
    );
});

test("lint reports a malformed sources file as E017", async () => {
  const r = await fixture({
    "goals/a.md": goal(["procedure.p"]),
    "procedures/p.md": proc("P"),
    [SIMP_SOURCES_FILE]: "goal.a: nope\n",
  });
  const found = r.issues.filter((i) => i.code === "E017");
  assert.equal(found.length, 1);
  assert.equal(found[0].path, SIMP_SOURCES_FILE);
  assert.equal(found[0].severity, "error");
});

test("lint warns about sources for unknown nodes with their line (W113)", async () => {
  const r = await fixture({
    "goals/a.md": goal(["procedure.p"]),
    "procedures/p.md": proc("P"),
    [SIMP_SOURCES_FILE]:
      "goal.a:\n  - src/a.ts\nprocedure.gone:\n  - src/gone.ts\n",
  });
  assert.deepEqual(
    r.issues
      .filter((i) => i.code === "W113")
      .map((i) => [i.path, i.line, i.message]),
    [[SIMP_SOURCES_FILE, 3, 'sources for unknown node "procedure.gone"']],
  );
  assert.equal(r.errorCount, 0, JSON.stringify(r.issues));
});

test("lint warns that inline sources are deprecated (W112)", async () => {
  const r = await fixture({
    "goals/a.md": goal(["procedure.p"]),
    "procedures/p.md": proc("P", "sources:\n  - src/p.ts\n"),
  });
  assert.deepEqual(
    r.issues.filter((i) => i.code === "W112").map((i) => [i.path, i.line]),
    [["procedures/p.md", 5]],
  );
  assert.equal(r.errorCount, 0, JSON.stringify(r.issues));
});

test("a valid sources file adds no diagnostics", async () => {
  const files = {
    "goals/a.md": goal(["procedure.p"]),
    "procedures/p.md": proc("P"),
  };
  const before = await fixture(files);
  const after = await fixture({
    ...files,
    [SIMP_SOURCES_FILE]: "goal.a: [src/a.ts]\nprocedure.p: [src/p.ts]\n",
  });
  assert.deepEqual(after.issues, before.issues);
});

test("memory sources lint the sources file too", async () => {
  const r = await lintKB(
    memorySource({
      "goals/a.md": goal(["procedure.p"]),
      "procedures/p.md": proc("P"),
      [SIMP_SOURCES_FILE]: "goal.b: [src/b.ts]\n",
    }),
  );
  assert.ok(r.issues.some((i) => i.code === "W113"));
});

test("filesystem sources read text files and miss absent ones", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "simp-"));
  await writeFile(path.join(dir, SIMP_SOURCES_FILE), "goal.a: [x]\n");
  const source = fsSource(dir);
  assert.equal(await source.read!(SIMP_SOURCES_FILE), "goal.a: [x]\n");
  assert.equal(await source.read!("missing.yaml"), undefined);
  await assert.rejects(async () => source.read!("../escape.yaml"));
});

test("the static index never lists the sources file", async () => {
  const index = await buildSimpIndex(
    memorySource({
      "simp.md": manifest,
      "goals/a.md": "A",
      [SIMP_SOURCES_FILE]: "goal.a: [src/a.ts]\n",
    }),
  );
  assert.deepEqual(index.files, ["goals/a.md", "simp.md"]);
});

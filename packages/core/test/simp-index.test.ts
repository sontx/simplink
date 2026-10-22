import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildSimpIndex,
  formatSimpIndex,
  parseSimpIndex,
  memorySource,
  loadDocs,
} from "../src/index.js";
const manifest =
  "---\ntype: simp\nname: crm\ntitle: CRM\nsummary: Customers\n---\n";
test("builds a sorted index from the KB files and rerun is identical", async () => {
  const source = memorySource({
    "procedures/b.md": "B",
    "simp.md": manifest,
    "goals/a.md": "A",
    "README.md": "Ignored",
  });
  const index = await buildSimpIndex(source);
  assert.deepEqual(index, {
    protocol: 1,
    name: "crm",
    files: ["goals/a.md", "procedures/b.md", "simp.md"],
  });
  assert.equal(
    formatSimpIndex(index),
    formatSimpIndex(await buildSimpIndex(source)),
  );
  assert.deepEqual(parseSimpIndex(formatSimpIndex(index)), index);
});
test("fails without simp.md", async () => {
  await assert.rejects(buildSimpIndex(memorySource({})), /KB has no simp.md/);
});
test("parse rejects invalid metadata and paths outside the KB", () => {
  for (const file of [
    "../x.md",
    "/abs.md",
    "goals/x.txt",
    "https://evil/x.md",
    "goals/%2e%2e/x.md",
    "goals/a.b.md",
  ])
    assert.throws(
      () => parseSimpIndex(`protocol: 1\nname: crm\nfiles: [${file}]`),
      /invalid index/,
    );
  for (const text of [
    "protocol: 2\nname: crm\nfiles: []",
    "protocol: 1\nname: Bad_Name\nfiles: []",
    "[]",
    "files: [",
  ])
    assert.throws(() => parseSimpIndex(text), /invalid index/);
});
test("loader ignores simp-index.yaml", async () => {
  const files = { "simp.md": manifest, "goals/a.md": "A" };
  assert.equal(
    (
      await loadDocs(
        memorySource({ ...files, "simp-index.yaml": "not a document" }),
      )
    ).length,
    (await loadDocs(memorySource(files))).length,
  );
});
test("bin writes the file and exits 2 without simp.md", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "simp-index-"));
  const bin = fileURLToPath(new URL("../src/index-cli.ts", import.meta.url));
  const run = () =>
    spawnSync(process.execPath, ["--import", "tsx", bin, dir], {
      encoding: "utf8",
    });
  assert.equal(run().status, 2);
  await writeFile(path.join(dir, "simp.md"), manifest);
  const result = run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /wrote .* \(1 files\)/);
  assert.equal(
    parseSimpIndex(await readFile(path.join(dir, "simp-index.yaml"), "utf8"))
      .name,
    "crm",
  );
});

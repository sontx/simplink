import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

test("public core import loads bundled schemas and serves KB tools", async () => {
  const core = await import("@sontx/simplink-core");
  const root = await mkdtemp(path.join(tmpdir(), "simp-core-public-"));
  try {
    await mkdir(path.join(root, "procedures"));
    await writeFile(path.join(root, "procedures/export.md"),
      "---\ntype: procedure\ntitle: Export records\nsummary: Export records\n---\n## Steps\n1. Export records\n");
    const tools = await core.createKBTools(root);
    assert.equal(tools.status.errors, 0);
    const result = tools.call("search_kb", { query: "export" });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content).hits[0].id, "procedure.export");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

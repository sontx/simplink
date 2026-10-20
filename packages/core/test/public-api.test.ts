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
    await writeFile(
      path.join(root, "procedures/export.md"),
      "---\ntype: procedure\ntitle: Export records\nsummary: Export records\n---\n## Steps\n1. Export records\n",
    );
    const tools = await core.createKBTools(root);
    assert.equal(tools.status.errors, 0);
    const result = await tools.call("search_kb", { query: "export" });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content).hits[0].id, "procedure.export");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("built package supports async engines, renderer and policy through awaited tools", async () => {
  const core = await import("@sontx/simplink-core");
  const kb = await core.createKB(
    core.memorySource({
      "goals/g.md":
        "---\ntype: goal\ntitle: Export\nsummary: Export records\naliases: [export]\nwhen_to_use: [export]\nprocedures: [procedure.a]\n---",
      "procedures/a.md":
        "---\ntype: procedure\ntitle: Export\nsummary: Export\n---\n## Steps\n1. Export\n",
    }),
    {
      search: async () => ({
        search: async () => [{ id: "goal.g", score: 2 }],
      }),
      resolve: {
        tenant: { context: { allowed: true } },
        availability: (_, tenant) =>
          tenant?.context?.allowed ? [] : ["Denied"],
      },
      renderer: async (resolved) => ({
        text: `available:${resolved.alternatives[0].available}`,
        tokens: 1,
        omitted: [],
      }),
    },
  );
  assert.equal((await kb.search("export")).hits[0].id, "goal.g");
  assert.equal(core.exportDocs(kb.graph, { layout: "graph" }).length, 2);
  assert.ok(kb.docs().some((page) => page.path === "index.md"));
  assert.match(
    kb.docs().find((page) => page.path === "guides/g.md")!.content,
    /Availability: available/,
  );
  const help: string[] = [];
  assert.equal(
    await core.runDocs(["--help"], { stdout: (s) => help.push(s) }),
    0,
  );
  assert.match(help[0], /simp-docs/);
  const tools = await core.createKBTools(kb);
  const result = await tools.call("resolve_goal", { goal_id: "goal.g" });
  assert.equal(result.content, "available:true");
  assert.equal(result.isError, undefined);
});

test("importing the built package is silent and preserves process.exitCode", async () => {
  const { spawnSync } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'process.exitCode = 7; await import("@sontx/simplink-core"); if (process.exitCode !== 7) throw Error("exitCode changed");',
    ],
    {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 7);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

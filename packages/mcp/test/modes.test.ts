import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createKB, createKBTools, memorySource } from "@sontx/simplink-core";
import { createSimpNodeHandler } from "@sontx/simplink-node";
import { createMcpHttpHandler } from "../src/http.js";
import { openFederatedKB, ArgumentError } from "../src/kb-source.js";

const args = { noPeers: false, peer: [], peerToken: [], peerTimeout: 2000 };
test("--kb with --simp is rejected", async () => {
  await assert.rejects(
    openFederatedKB({ ...args, kb: "kb", simp: "other" }, {}),
    ArgumentError,
  );
  for (const bin of ["bin.js", "http-bin.js"]) {
    const child = spawnSync(
      process.execPath,
      [
        fileURLToPath(new URL(`../dist/${bin}`, import.meta.url)),
        "--kb",
        "kb",
        "--simp",
        "other",
      ],
      { encoding: "utf8" },
    );
    assert.equal(child.status, 2);
    assert.match(child.stderr, /--kb and --simp cannot be used together/);
    assert.doesNotMatch(child.stderr, /at .*\.js:\d/);
  }
});
test("peer mode accepts a folder and keeps home IDs unqualified", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "simp-mcp-mode-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, "procedures"));
  await writeFile(
    path.join(dir, "simp.md"),
    "---\ntype: simp\nname: crm\ntitle: CRM\nsummary: Customers\n---\n",
  );
  await writeFile(
    path.join(dir, "procedures/import.md"),
    "---\ntype: procedure\ntitle: Import customers\nsummary: Import customers\n---\n## Steps\n1. Import\n",
  );
  const kb = await openFederatedKB({ ...args, simp: dir }, {});
  assert.equal((await kb.node("procedure.import"))?.id, "procedure.import");
  assert.equal(
    (await kb.search("Import customers")).hits[0].id,
    "procedure.import",
  );
});
test("standalone mode federates a relative folder peer and --no-peers keeps results local", async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), "simp-mcp-relative-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, "x"));
  await mkdir(path.join(dir, "crm", "procedures"), { recursive: true });
  await writeFile(
    path.join(dir, "x", "simp.md"),
    "---\ntype: simp\nname: x\ntitle: X\nsummary: Hub\npeers: [{name: crm, url: ../crm}]\n---\n",
  );
  await writeFile(
    path.join(dir, "crm", "simp.md"),
    "---\ntype: simp\nname: crm\ntitle: CRM\nsummary: Customers\n---\n",
  );
  await writeFile(
    path.join(dir, "crm", "procedures/import.md"),
    "---\ntype: procedure\ntitle: Import customers\nsummary: Import customers\n---\n## Steps\n1. Import\n",
  );
  const kb = await openFederatedKB({ ...args, kb: path.join(dir, "x") }, {});
  assert.ok(
    (await kb.search("Import customers")).hits.some(
      (h) => h.id === "crm:procedure.import",
    ),
  );
  const local = await openFederatedKB(
    { ...args, kb: path.join(dir, "x"), noPeers: true },
    {},
  );
  assert.equal((await local.search("Import customers")).hits.length, 0);
});

test("peer mode discovers a node name and healthz lists peers", async (t) => {
  const local = await createKB(
    memorySource({
      "simp.md":
        "---\ntype: simp\nname: crm\ntitle: CRM\nsummary: Customers\n---\n",
      "procedures/import.md":
        "---\ntype: procedure\ntitle: Import customers\nsummary: Import customers\n---\n## Steps\n1. Import\n",
    }),
  );
  const node = createServer(createSimpNodeHandler({ kb: local, peers: [] }));
  await new Promise<void>((resolve) => node.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    node.closeAllConnections();
    node.close();
  });
  const url = `http://127.0.0.1:${(node.address() as AddressInfo).port}/simp`;
  const kb = await openFederatedKB({ ...args, simp: url }, {});
  assert.equal(kb.status.simp, "crm");
  assert.equal(
    (await kb.search("Import customers")).hits[0].id,
    "procedure.import",
  );
  const server = createServer(
    createMcpHttpHandler(await createKBTools(kb), { peers: () => kb.peers() }),
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const health = (await (
    await fetch(
      `http://127.0.0.1:${(server.address() as AddressInfo).port}/healthz`,
    )
  ).json()) as { peers: { simp: string; ok: boolean }[] };
  assert.equal(health.peers[0].simp, "crm");
  assert.equal(health.peers[0].ok, true);
});

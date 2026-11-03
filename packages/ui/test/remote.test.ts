import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { createKB, memorySource } from "@sontx/simplink-core";
import { createSimpNodeHandler } from "@sontx/simplink-node";
import {
  manifestIssues,
  memoryStore,
  remoteStore,
} from "../src/workspace/store.js";
import { WorkspaceService } from "../src/workspace/service.js";

async function serve(handler: RequestListener) {
  const server = createServer(handler).listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
const crm = fileURLToPath(
  new URL("../../../test/fixtures/mesh/crm/", import.meta.url),
);

test("remote store rebuilds a simp node's KB read-only", async () => {
  const kb = await createKB(crm);
  const server = await serve(createSimpNodeHandler({ kb }));
  try {
    const service = await WorkspaceService.open(await remoteStore(server.url));
    const snapshot = service.snapshot();
    assert.equal(service.store.readOnly, true);
    assert.deepEqual(
      snapshot.nodes.map((n) => n.id).sort(),
      [...kb.graph.nodes.keys()].sort(),
    );
    assert.deepEqual(
      snapshot.edges.map((e) => `${e.from} ${e.kind} ${e.to}`).sort(),
      kb.graph.edges.map((e) => `${e.from} ${e.kind} ${e.to}`).sort(),
    );
    assert.equal(snapshot.status.errors, kb.status.errors);
    const [first] = snapshot.nodes;
    assert.equal(
      service.nodeDetail(first.id).node.body,
      kb.node(first.id)!.body,
    );
    await assert.rejects(
      service.writeFile(first.path, "x"),
      /Remote KBs are read-only/,
    );
  } finally {
    server.close();
  }
});

test("remote workspaces show the node's own issues, including values and files lost in the rebuild", async () => {
  const files: Record<string, string> = {
    "simp.md":
      "---\ntype: simp\nname: x\ntitle: X\nsummary: X\nserves: [pull]\n---\n",
    "goals/a.md":
      "---\ntype: goal\ntitle: A\nsummary: A\naliases: [a]\nstatus: retired\n---\n",
    "goals/b.md": "---\ntype: goal\ntitle: [unclosed\n---\n",
  };
  let kb = await createKB(memorySource(files));
  const server = await serve((req, res) =>
    createSimpNodeHandler({ kb, allowedOrigins: ["*"] })(req, res),
  );
  try {
    const service = await WorkspaceService.open(await remoteStore(server.url));
    const codes = (issues: { path: string; code: string; line?: number }[]) =>
      issues.map((i) => `${i.path} ${i.code} ${i.line}`).sort();
    assert.deepEqual(codes(service.snapshot().issues), codes(kb.issues));
    assert.ok(
      service
        .snapshot()
        .issues.some(
          (i) => i.path === "goals/a.md" && i.code === "E012" && i.line === 6,
        ),
    );
    assert.equal(service.snapshot().status.errors, kb.status.errors);
    // Reload picks up the node's new lint result.
    files["goals/a.md"] = files["goals/a.md"].replace("retired", "deprecated");
    kb = await createKB(memorySource(files));
    await service.reload();
    assert.deepEqual(codes(service.snapshot().issues), codes(kb.issues));
  } finally {
    server.close();
  }
});

test("manifest issues drop malformed entries and missing lists", () => {
  assert.equal(manifestIssues(undefined), undefined);
  assert.deepEqual(
    manifestIssues([
      { code: "E1", severity: "error", path: "a.md", message: "m", line: 3 },
      { code: "W1", severity: "warning", path: "b.md", message: "m", line: 0 },
      { code: "X", severity: "fatal", path: "c.md", message: "m" },
      null,
    ]),
    [
      { code: "E1", severity: "error", path: "a.md", message: "m", line: 3 },
      { code: "W1", severity: "warning", path: "b.md", message: "m" },
    ],
  );
});

test("playground tools reach peers declared with an HTTP URL", async () => {
  const server = await serve(
    createSimpNodeHandler({ kb: await createKB(crm) }),
  );
  try {
    const service = await WorkspaceService.open(
      memoryStore({
        "simp.md": `---\ntype: simp\nname: x\ntitle: X\nsummary: X\npeers: [{name: crm, url: "${server.url}/simp"}]\n---\n`,
      }),
    );
    const result = await service.callTool("search_kb", { query: "customers" });
    assert.match(result.content, /crm:/);
  } finally {
    server.close();
  }
});

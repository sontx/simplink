import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createKB, memorySource } from "@sontx/simplink-core";
import { httpPeer, startSimpNode } from "../src/index.js";

const crm = fileURLToPath(
  new URL("../../../test/fixtures/mesh/crm/", import.meta.url),
);

test("startSimpNode serves a KB folder until closed", async () => {
  const logs: Record<string, unknown>[] = [];
  const node = await startSimpNode({
    kb: crm,
    port: 0,
    token: "secret",
    log: (entry) => logs.push(entry),
  });
  try {
    assert.match(node.url, /^http:\/\/127\.0\.0\.1:\d+\/simp$/);
    const peer = httpPeer(node.url, { token: "secret" });
    assert.equal((await peer.manifest()).name, "crm");
    assert.equal((await peer.list!()).nodes.length, node.status.nodes);
    assert.ok(logs.some((entry) => entry.msg === "request"));
  } finally {
    await node.close();
  }
  assert.equal(node.server.listening, false);
});

test("startSimpNode accepts a loaded KB and requires simp.md", async () => {
  await assert.rejects(
    startSimpNode({ kb: await createKB(memorySource({})), port: 0 }),
    /has no simp.md/,
  );
  const node = await startSimpNode({
    kb: await createKB(crm),
    port: 0,
    basePath: "/api",
  });
  try {
    assert.ok(node.url.endsWith("/api"));
    assert.equal((await httpPeer(node.url).manifest()).name, "crm");
  } finally {
    await node.close();
  }
});

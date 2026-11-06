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

test("startSimpNode on loopback refuses foreign Host headers by default", async () => {
  const { request } = await import("node:http");
  const node = await startSimpNode({ kb: crm, port: 0 });
  const status = (host: string) =>
    new Promise<number>((resolve, reject) => {
      const url = new URL(`${node.url}/v1/nodes`);
      request(url, { headers: { host } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      })
        .on("error", reject)
        .end();
    });
  try {
    const port = new URL(node.url).port;
    assert.equal(await status(`127.0.0.1:${port}`), 200);
    assert.equal(await status(`localhost:${port}`), 200);
    assert.equal(await status(`evil.example:${port}`), 403);
  } finally {
    await node.close();
  }
  const open = await startSimpNode({
    kb: crm,
    port: 0,
    allowedHosts: ["kb.example.com"],
  });
  try {
    assert.equal((await fetch(`${open.url}/v1/nodes`)).status, 403);
  } finally {
    await open.close();
  }
});

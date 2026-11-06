import assert from "node:assert/strict";
import { test } from "node:test";
import { httpPeer } from "../src/http-peer.js";
const manifest = {
  protocol: 1,
  name: "crm",
  title: "CRM",
  summary: "CRM",
  tags: [],
  serves: ["pull"],
  peers: [],
  errors: 0,
};
test("discovers names and caches manifests for sixty seconds", async () => {
  let now = 0,
    calls = 0;
  const peer = httpPeer("https://example.test/simp", {
    now: () => now,
    fetch: async () => {
      calls++;
      return Response.json(manifest);
    },
  });
  assert.equal(peer.name, "");
  await peer.manifest();
  assert.equal(peer.name, "crm");
  now = 59000;
  await peer.manifest();
  assert.equal(calls, 1);
  now = 61000;
  await peer.manifest();
  assert.equal(calls, 2);
});
test("rejects malformed JSON, mismatched names, and unsupported protocols", async () => {
  await assert.rejects(
    httpPeer("https://example.test", {
      fetch: async () => new Response("<html>"),
    }).manifest(),
    /invalid response/,
  );
  await assert.rejects(
    httpPeer("https://example.test", {
      name: "other",
      fetch: async () => Response.json(manifest),
    }).manifest(),
    /peer name mismatch/,
  );
  await assert.rejects(
    httpPeer("https://example.test", {
      fetch: async () => Response.json({ ...manifest, protocol: 2 }),
    }).manifest(),
    /unsupported protocol 2/,
  );
});
test("rejects malformed nested response values before they enter core", async () => {
  const { newTrace, createPeerService, createKB, memorySource } =
    await import("@sontx/simplink-core");
  for (const body of [
    { hits: [null], goals: [], sources: [] },
    { hits: [], goals: [{ id: 3 }], sources: [] },
    { hits: [], goals: [], sources: [null] },
  ]) {
    const peer = httpPeer("https://example.test", {
      name: "crm",
      fetch: async (url) =>
        Response.json(String(url).endsWith("manifest") ? manifest : body),
    });
    await assert.rejects(
      peer.explore({ query: "x", trace: newTrace() }),
      /invalid response/,
    );
    const kb = await createKB(
      memorySource({
        "simp.md":
          "---\ntype: simp\nname: home\ntitle: Home\nsummary: Home\n---\n",
      }),
    );
    const result = await createPeerService({ kb, peers: [peer] }).explore({
      query: "x",
      trace: newTrace(),
    });
    assert.ok(
      result.sources.some(
        (source) => !source.ok && source.error === "invalid response",
      ),
    );
  }
  const peer = httpPeer("https://example.test", {
    fetch: async (url) =>
      Response.json(
        String(url).endsWith("manifest")
          ? manifest
          : { nodes: [{ id: 3 }], missing: [], sources: [] },
      ),
  });
  await assert.rejects(
    peer.lookup({ ids: ["goal.x"], trace: newTrace() }),
    /invalid response/,
  );
});
test("rejects responses larger than maxResponseBytes", async () => {
  const peer = httpPeer("https://example.test", {
    maxResponseBytes: 100,
    fetch: async () => Response.json({ ...manifest, summary: "x".repeat(200) }),
  });
  await assert.rejects(peer.manifest(), /response too large/);
  assert.equal(
    (
      await httpPeer("https://example.test", {
        maxResponseBytes: 1000,
        fetch: async () => Response.json(manifest),
      }).manifest()
    ).name,
    "crm",
  );
});

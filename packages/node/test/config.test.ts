import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePeerOverrides, loadPeerConfig } from "../src/config.js";
test("flags override env and declared URLs; token env names use underscore", () => {
  const overrides = parsePeerOverrides(
    { peer: ["zalo-oa=../new"], "peer-token": ["crm=flag"] },
    { SIMP_PEERS: "zalo-oa=../old", SIMP_PEER_TOKEN_ZALO_OA: "env" },
  );
  assert.equal(overrides.urls["zalo-oa"], "../new");
  assert.equal(overrides.tokens["zalo-oa"], "env");
  assert.equal(overrides.tokens.crm, "flag");
  const config = loadPeerConfig(
    {
      name: "hub",
      title: "Hub",
      summary: "Hub",
      tags: [],
      serves: ["pull"],
      peers: [{ name: "zalo-oa", url: "../default" }, { name: "missing" }],
    },
    overrides,
    { timeoutMs: 2000 },
  );
  assert.deepEqual(config.skipped, ["missing"]);
  assert.equal(config.peers.length, 1);
});

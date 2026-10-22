import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  createKB,
  createPeerService,
  createFederatedKB,
  newTrace,
  memorySource,
} from "@sontx/simplink-core";
import { createSimpNodeHandler } from "../src/http.js";
import { httpPeer } from "../src/http-peer.js";
import { lintPeers } from "../src/lint-peers.js";
import { serve } from "./helpers.js";
const fixture = (name: string) =>
  createKB(
    fileURLToPath(
      new URL(`../../../test/fixtures/mesh/${name}/`, import.meta.url),
    ),
  );
test("real HTTP mesh searches, forwards, pulls and tolerates a failed peer", async () => {
  const crm = await serve(
    createSimpNodeHandler({
      service: createPeerService({ kb: await fixture("crm") }),
    }),
  );
  const crmPeer = httpPeer(`${crm.url}/simp`, { name: "crm", timeoutMs: 300 });
  const zaloKB = await fixture("zalo-oa");
  const zalo = await serve(
    createSimpNodeHandler({
      service: createPeerService({ kb: zaloKB, peers: [crmPeer] }),
    }),
  );
  try {
    const zaloPeer = httpPeer(`${zalo.url}/simp`, { name: "zalo-oa" });
    const hub = createPeerService({
      kb: await fixture("hub"),
      peers: [zaloPeer, crmPeer],
    });
    const results = await hub.explore({
      query: "customers",
      trace: newTrace(),
    });
    assert.ok(results.hits.some((hit) => hit.id.startsWith("crm:")));
    assert.ok(results.hits.some((hit) => hit.id.startsWith("zalo-oa:")));
    const forwarding = createPeerService({
      kb: await fixture("hub"),
      peers: [zaloPeer],
    });
    assert.ok(
      (
        await forwarding.lookup({
          ids: ["crm:goal.import-customers"],
          trace: newTrace(),
        })
      ).nodes.some((n) => n.id === "crm:goal.import-customers"),
    );
    const federated = await createFederatedKB({
      local: zaloKB,
      peers: [crmPeer],
    });
    const plan = await federated.resolveGoal("goal.send-broadcast");
    assert.match(JSON.stringify(plan), /crm:procedure.import.csv/);
    const delegated = await createFederatedKB({
      local: zaloKB,
      peers: [crmPeer],
      modes: { crm: "delegate" },
    });
    assert.match(
      JSON.stringify(await delegated.resolveGoal("goal.send-broadcast")),
      /crm:procedure.import.csv/,
    );
    const resolved = await crmPeer.resolve!({
      target: "procedure.import.csv",
      trace: newTrace(),
    });
    assert.equal(resolved.resolved.subject, "procedure");
    assert.deepEqual(await lintPeers(zaloKB, [crmPeer]), []);
    await crm.close();
    const partial = await hub.explore({
      query: "customers",
      trace: newTrace(),
    });
    assert.ok(
      partial.sources.some((source) => source.simp === "crm" && !source.ok),
    );
    assert.ok(
      (await lintPeers(zaloKB, [crmPeer])).some((i) => i.code === "W109"),
    );
  } finally {
    await zalo.close();
    await crm.close();
  }
});
test("online lint reports absent remote refs", async () => {
  const crm = await fixture("crm");
  const kb = await createKB(
    memorySource({
      "simp.md":
        "---\ntype: simp\nname: test\ntitle: Test\nsummary: Test\npeers: [{name: crm}]\n---\n",
      "procedures/a.md":
        "---\ntype: procedure\ntitle: A\nsummary: A\nrequires: [crm:procedure.missing]\n---\n",
    }),
  );
  assert.ok(
    (await lintPeers(kb, [createPeerService({ kb: crm })])).some(
      (i) => i.code === "E007",
    ),
  );
});

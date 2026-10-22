import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createKB,
  createFederatedKB,
  buildSimpIndex,
  formatSimpIndex,
  fsSource,
  newTrace,
} from "@sontx/simplink-core";
import { openPeer } from "../src/open-peer.js";
import { serve } from "./helpers.js";
const root = fileURLToPath(
  new URL("../../../test/fixtures/mesh/crm/", import.meta.url),
);
test("static peers serve lookup without index and search with index", async () => {
  let index: string | undefined,
    now = 0;
  const requests: string[] = [];
  const server = await serve(async (req, res) => {
    requests.push(req.headers.authorization ?? "");
    const path = (req.url ?? "/").slice(4);
    if (path === "simp-index.yaml") {
      res.writeHead(index ? 200 : 404).end(index);
      return;
    }
    if (!path || path.includes("..")) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.end(await readFile(`${root}/${path}`));
    } catch {
      res.writeHead(404).end();
    }
  });
  try {
    const peer = openPeer(`${server.url}/kb`, {
      token: "secret",
      now: () => now,
    });
    assert.equal((await peer.manifest()).name, "crm");
    const found = await peer.lookup({
      ids: ["goal.import-customers", "goal.missing", "goal.../x"],
      trace: newTrace(),
    });
    assert.equal(found.nodes[0].id, "goal.import-customers");
    assert.deepEqual(found.nodes[0].in, []);
    assert.equal(found.missing.length, 2);
    assert.equal(
      (await peer.explore({ query: "customers", trace: newTrace() })).hits
        .length,
      0,
    );
    const local = await createKB(
      fileURLToPath(
        new URL("../../../test/fixtures/mesh/zalo-oa/", import.meta.url),
      ),
    );
    const federated = await createFederatedKB({
      local,
      peers: [peer],
      modes: { crm: "delegate" },
    });
    assert.match(
      JSON.stringify(await federated.resolveGoal("goal.send-broadcast")),
      /crm:procedure.import.csv/,
    );
    index = formatSimpIndex(await buildSimpIndex(fsSource(root)));
    now = 61000;
    assert.ok(
      (await peer.explore({ query: "customers", trace: newTrace() })).hits
        .length,
    );
    assert.ok(requests.every((value) => value === "Bearer secret"));
  } finally {
    await server.close();
  }
});
test("static safety rejects traversal, oversized indices, SPA fallbacks, and redirects outside root", async () => {
  for (const files of [
    ["../x.md"],
    ["https://evil/x.md"],
    ["goals/%2e%2e/x.md"],
    Array(5001).fill("goals/x.md"),
  ]) {
    const server = await serve(async (req, res) => {
      if (req.url === "/kb/simp.md") res.end(await readFile(`${root}/simp.md`));
      else if (req.url === "/kb/simp-index.yaml")
        res.end(JSON.stringify({ protocol: 1, name: "crm", files }));
      else res.writeHead(404).end();
    });
    try {
      await assert.rejects(
        openPeer(`${server.url}/kb`).manifest(),
        /invalid index/,
      );
    } finally {
      await server.close();
    }
  }
  const spa = await serve((_req, res) => res.end("<html>SPA</html>"));
  try {
    await assert.rejects(openPeer(spa.url).manifest(), /unreachable/);
  } finally {
    await spa.close();
  }
  let escaped = false;
  const redirects = await serve((req, res) => {
    if (req.url?.startsWith("/other")) {
      escaped = true;
      res.end("bad");
    } else res.writeHead(302, { location: "/other/x.md" }).end();
  });
  try {
    await assert.rejects(
      openPeer(`${redirects.url}/kb`).manifest(),
      /redirect outside KB/,
    );
    assert.equal(escaped, false);
  } finally {
    await redirects.close();
  }
});
test("folder peers load relative paths and file URLs, and reject missing simp documents", async () => {
  for (const url of [
    root,
    new URL("../../../test/fixtures/mesh/crm/", import.meta.url).href,
  ]) {
    const peer = openPeer(url);
    assert.deepEqual((await peer.manifest()).serves, ["pull"]);
    assert.ok(
      (await peer.explore({ query: "customers", trace: newTrace() })).hits
        .length,
    );
  }
  const peer = openPeer("crm", {
    kbRoot: fileURLToPath(
      new URL("../../../test/fixtures/mesh/", import.meta.url),
    ),
  });
  assert.equal((await peer.manifest()).name, "crm");
  await assert.rejects(
    openPeer(
      fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
    ).manifest(),
    /no simp.md/,
  );
});
test("static redirects are bounded, stay on origin, and follow valid in-root locations", async () => {
  let outsideCalls = 0;
  const outside = await serve((_req, res) => {
    outsideCalls++;
    res.end("outside");
  });
  let mode = "inside";
  const server = await serve(async (req, res) => {
    if (req.url === "/kb/simp.md") {
      res.end(await readFile(`${root}/simp.md`));
      return;
    }
    if (req.url === "/kb/simp-index.yaml" || req.url === "/kb/v1/manifest") {
      res.writeHead(404).end();
      return;
    }
    if (req.url === "/kb/goals/x.md") {
      res
        .writeHead(302, {
          location:
            mode === "inside"
              ? "/kb/goals/import-customers.md"
              : mode === "outside"
                ? `${outside.url}/kb/goals/x.md`
                : "/kb/goals/redirect-1.md",
        })
        .end();
      return;
    }
    if (req.url?.includes("redirect-")) {
      const n = Number(req.url.match(/redirect-(\d+)/)?.[1]);
      res.writeHead(302, { location: `/kb/goals/redirect-${n + 1}.md` }).end();
      return;
    }
    try {
      res.end(await readFile(`${root}/${req.url!.slice(4)}`));
    } catch {
      res.writeHead(404).end();
    }
  });
  try {
    const peer = openPeer(`${server.url}/kb`);
    assert.equal(
      (await peer.lookup({ ids: ["goal.x"], trace: newTrace() })).nodes[0].id,
      "goal.x",
    );
    mode = "outside";
    await assert.rejects(
      peer.lookup({ ids: ["goal.x"], trace: newTrace() }),
      /redirect outside KB/,
    );
    assert.equal(outsideCalls, 0);
    mode = "loop";
    await assert.rejects(
      peer.lookup({ ids: ["goal.x"], trace: newTrace() }),
      /too many redirects/,
    );
  } finally {
    await server.close();
    await outside.close();
  }
});
test("static byte budget rejects an oversized response", async () => {
  const server = await serve(async (req, res) => {
    if (req.url === "/simp.md") res.end(await readFile(`${root}/simp.md`));
    else if (req.url === "/simp-index.yaml") res.end("x".repeat(20000001));
    else res.writeHead(404).end();
  });
  try {
    await assert.rejects(openPeer(server.url).manifest(), /invalid index/);
  } finally {
    await server.close();
  }
});

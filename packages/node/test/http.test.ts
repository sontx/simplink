import assert from "node:assert/strict";
import { test } from "node:test";
import { serve } from "./helpers.js";

import { createKB, createPeerService, newTrace } from "@sontx/simplink-core";
import { createSimpNodeHandler } from "../src/http.js";
import { httpPeer } from "../src/http-peer.js";
export const crmRoot = new URL(
  "../../../test/fixtures/mesh/crm/",
  import.meta.url,
);

test("HTTP API validates requests, protects auth, and round trips peer calls", async () => {
  const service = createPeerService({
    kb: await createKB(crmRoot.pathname.replace(/^\/(\w:)/, "$1")),
  });
  const server = await serve(
    createSimpNodeHandler({ service, token: "secret", maxBodyBytes: 300 }),
  );
  try {
    assert.equal((await fetch(`${server.url}/healthz`)).status, 200);
    assert.equal(
      (await (await fetch(`${server.url}/healthz`)).json()).peers,
      undefined,
    );
    assert.ok(
      (
        await (
          await fetch(`${server.url}/healthz`, {
            headers: { authorization: "Bearer secret" },
          })
        ).json()
      ).peers,
    );
    assert.equal((await fetch(`${server.url}/simp/v1/manifest`)).status, 401);
    const peer = httpPeer(`${server.url}/simp`, { token: "secret" });
    assert.equal((await peer.manifest()).name, "crm");
    assert.ok(
      (await peer.explore({ query: "customers", trace: newTrace() })).hits
        .length,
    );
    assert.equal(
      (await peer.lookup({ ids: ["goal.import-customers"], trace: newTrace() }))
        .nodes[0].id,
      "goal.import-customers",
    );
    const headers = {
      authorization: "Bearer secret",
      "content-type": "application/json",
    };
    assert.equal(
      (
        await fetch(`${server.url}/simp/v1/explore`, {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      400,
    );
    assert.equal(
      (await fetch(`${server.url}/simp/v1/explore`, { headers })).status,
      405,
    );
    assert.equal(
      (await fetch(`${server.url}/simp/v2/x`, { headers })).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${server.url}/simp/v1/explore`, {
          method: "POST",
          headers,
          body: "x".repeat(400),
        })
      ).status,
      413,
    );
  } finally {
    await server.close();
  }
});
test("HTTP auth is optional, pull-only resolve absent, and host/origin allowlists enforced", async () => {
  const { memorySource } = await import("@sontx/simplink-core");
  const kb = await createKB(
    memorySource({
      "simp.md":
        "---\ntype: simp\nname: pull\ntitle: Pull\nsummary: Pull\n---\n",
    }),
  );
  const server = await serve(
    createSimpNodeHandler({
      kb,
      peers: [],
      allowedOrigins: ["https://allowed.test"],
    }),
  );
  try {
    assert.equal((await fetch(`${server.url}/simp/v1/manifest`)).status, 200);
    assert.equal(
      (await fetch(`${server.url}/simp/v1/resolve`, { method: "POST" })).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${server.url}/simp/v1/manifest`, {
          headers: { origin: "https://evil.test" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(`${server.url}/simp/v1/manifest`, {
          headers: { origin: "https://allowed.test" },
        })
      ).status,
      200,
    );
  } finally {
    await server.close();
  }
  const restricted = await serve(
    createSimpNodeHandler({ kb, allowedHosts: ["allowed.test"] }),
  );
  try {
    assert.equal(
      (await fetch(`${restricted.url}/simp/v1/manifest`)).status,
      403,
    );
  } finally {
    await restricted.close();
  }
});

test("healthz stays public for hosts outside the allowlist", async () => {
  const service = createPeerService({
    kb: await createKB(crmRoot.pathname.replace(/^\/(\w:)/, "$1")),
  });
  const server = await serve(
    createSimpNodeHandler({ service, allowedHosts: ["kb.example.com"] }),
  );
  try {
    assert.equal((await fetch(`${server.url}/healthz`)).status, 200);
    assert.equal((await fetch(`${server.url}/simp/v1/manifest`)).status, 403);
  } finally {
    await server.close();
  }
});

test("nodes route lists the KB and CORS allows only listed origins", async () => {
  const kb = await createKB(crmRoot.pathname.replace(/^\/(\w:)/, "$1"));
  const server = await serve(
    createSimpNodeHandler({
      kb,
      token: "secret",
      allowedOrigins: ["http://ui.test"],
    }),
  );
  try {
    const preflight = await fetch(`${server.url}/simp/v1/nodes`, {
      method: "OPTIONS",
      headers: { origin: "http://ui.test" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(
      preflight.headers.get("access-control-allow-origin"),
      "http://ui.test",
    );
    assert.match(
      preflight.headers.get("access-control-allow-headers") ?? "",
      /authorization/,
    );
    const denied = await fetch(`${server.url}/simp/v1/nodes`, {
      headers: { origin: "http://evil.test", authorization: "Bearer secret" },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(`${server.url}/simp/v1/nodes`)).status, 401);
    const peer = httpPeer(`${server.url}/simp`, { token: "secret" });
    assert.deepEqual(
      (await peer.list!()).nodes.map((n) => n.id).sort(),
      [...kb.graph.nodes.keys()].sort(),
    );
  } finally {
    await server.close();
  }
});

test("allowed origin * gives CORS to any origin and still requires the token", async () => {
  const kb = await createKB(crmRoot.pathname.replace(/^\/(\w:)/, "$1"));
  const server = await serve(
    createSimpNodeHandler({ kb, token: "secret", allowedOrigins: ["*"] }),
  );
  try {
    const ok = await fetch(`${server.url}/simp/v1/nodes`, {
      headers: { origin: "http://any.test", authorization: "Bearer secret" },
    });
    assert.equal(ok.status, 200);
    assert.equal(
      ok.headers.get("access-control-allow-origin"),
      "http://any.test",
    );
    const anonymous = await fetch(`${server.url}/simp/v1/nodes`, {
      headers: { origin: "http://any.test" },
    });
    assert.equal(anonymous.status, 401);
  } finally {
    await server.close();
  }
});

test("assets route serves only images that node bodies reference, from inside the KB folder", async () => {
  const { mkdtemp, mkdir, writeFile, symlink, rm } =
    await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const root = await mkdtemp(path.join(tmpdir(), "simp-assets-"));
  const outside = await mkdtemp(path.join(tmpdir(), "simp-outside-"));
  await mkdir(path.join(root, "states"));
  await mkdir(path.join(root, "assets"));
  await writeFile(
    path.join(root, "simp.md"),
    "---\ntype: simp\ntitle: Shop\nsummary: Shop\nname: shop\n---\n\nShop\n",
  );
  await writeFile(
    path.join(root, "states/ready.md"),
    "---\ntype: state\ntitle: Ready\nsummary: Ready\ncheck: It is ready\n---\n\n" +
      "![Form](../assets/my%20form.png) ![Leak](../assets/link.png) ![Gone](../assets/gone.png)\n",
  );
  await writeFile(path.join(root, "assets/my form.png"), "png");
  await writeFile(path.join(root, "assets/unused.png"), "unused");
  await writeFile(path.join(outside, "secret.png"), "secret");
  await symlink(
    path.join(outside, "secret.png"),
    path.join(root, "assets/link.png"),
  );
  const kb = await createKB(root);
  const server = await serve(
    createSimpNodeHandler({
      kb,
      token: "secret",
      assetRoot: root,
      allowedOrigins: ["http://ui.test"],
    }),
  );
  const get = (rel: string, auth = true) =>
    fetch(`${server.url}/simp/v1/assets/${rel}`, {
      headers: {
        origin: "http://ui.test",
        ...(auth ? { authorization: "Bearer secret" } : {}),
      },
    });
  try {
    assert.equal((await get("assets/my%20form.png", false)).status, 401);
    const ok = await get("assets/my%20form.png");
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "image/png");
    assert.equal(
      ok.headers.get("access-control-allow-origin"),
      "http://ui.test",
    );
    assert.equal(await ok.text(), "png");
    for (const rel of [
      "assets/unused.png",
      "assets/link.png",
      "assets/gone.png",
      "simp.md",
      "states/ready.md",
      "assets/..%2Fsimp.md",
      "%E0%A4%A",
    ])
      assert.equal((await get(rel)).status, 404, rel);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test("assets route is absent without an asset root", async () => {
  const server = await serve(
    createSimpNodeHandler({
      kb: await createKB(crmRoot.pathname.replace(/^\/(\w:)/, "$1")),
    }),
  );
  try {
    assert.equal(
      (await fetch(`${server.url}/simp/v1/assets/simp.md`)).status,
      404,
    );
  } finally {
    await server.close();
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../src/index.js";

const proxy = (url: string, init?: RequestInit) =>
  new Request(`https://proxy.test/?url=${encodeURIComponent(url)}`, init);

function upstream(
  body: string,
  init: ResponseInit = {},
  url?: string,
): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch: (async (input: string) => {
      calls.push(String(input));
      const response = new Response(body, init);
      Object.defineProperty(response, "url", { value: url ?? input });
      return response;
    }) as typeof fetch,
  };
}

test("proxies a KB file as plain text with CORS headers", async () => {
  const origin = upstream("---\ntype: simp\n---\n", {
    headers: { "content-type": "text/markdown" },
  });
  const response = await handle(
    proxy("https://kb.example/docs/simp.md", {
      headers: { origin: "https://ui.example" },
    }),
    {},
    origin.fetch,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(
    response.headers.get("content-type"),
    "text/plain; charset=utf-8",
  );
  assert.equal(await response.text(), "---\ntype: simp\n---\n");
  assert.deepEqual(origin.calls, ["https://kb.example/docs/simp.md"]);
});

test("allows only configured origins when ALLOWED_ORIGINS is set", async () => {
  const env = { ALLOWED_ORIGINS: "https://ui.example, http://localhost:5173/" };
  const ok = await handle(
    proxy("https://kb.example/simp-index.yaml", {
      headers: { origin: "http://localhost:5173" },
    }),
    env,
    upstream("protocol: 1").fetch,
  );
  assert.equal(
    ok.headers.get("access-control-allow-origin"),
    "http://localhost:5173",
  );
  for (const headers of [{ origin: "https://evil.example" }, {}]) {
    const refused = await handle(
      proxy("https://kb.example/simp.md", { headers }),
      env,
      upstream("x").fetch,
    );
    assert.equal(refused.status, 403);
  }
});

test("refuses anything that is not a GET for an http(s) KB file", async () => {
  const origin = upstream("x");
  for (const url of [
    "https://kb.example/index.html",
    "https://kb.example/",
    "file:///etc/simp.md",
    "https://user:pass@kb.example/simp.md",
    "not a url",
  ])
    assert.equal((await handle(proxy(url), {}, origin.fetch)).status, 400, url);
  assert.equal(
    (
      await handle(
        proxy("https://kb.example/simp.md", { method: "POST", body: "x" }),
        {},
        origin.fetch,
      )
    ).status,
    405,
  );
  assert.deepEqual(origin.calls, []);
});

test("reports SPA fallbacks and redirects away from KB files as missing", async () => {
  const html = await handle(
    proxy("https://kb.example/goals/missing.md"),
    {},
    upstream("<!doctype html>", { headers: { "content-type": "text/html" } })
      .fetch,
  );
  assert.equal(html.status, 404);
  const redirected = await handle(
    proxy("https://kb.example/simp.md"),
    {},
    upstream("secret", {}, "https://kb.example/login").fetch,
  );
  assert.equal(redirected.status, 404);
});

test("passes upstream errors through and rejects oversized files", async () => {
  const missing = await handle(
    proxy("https://kb.example/simp.md"),
    {},
    upstream("nope", { status: 404 }).fetch,
  );
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("access-control-allow-origin"), "*");
  const large = await handle(
    proxy("https://kb.example/simp.md"),
    {},
    upstream("x".repeat(5_000_001)).fetch,
  );
  assert.equal(large.status, 413);
});

test("answers CORS preflight requests", async () => {
  const response = await handle(
    proxy("https://kb.example/simp.md", { method: "OPTIONS" }),
    {},
  );
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods")!, /GET/);
});

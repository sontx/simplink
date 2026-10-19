import { fileURLToPath } from "node:url";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpHttpHandler, type McpHttpOptions, type RequestLog } from "@sontx/simplink-mcp";

const logs: RequestLog[] = [];
let base = "";
let srv: Server;

async function start(opts: McpHttpOptions = {}) {
  const tools = await createKBTools(fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)), { tenantContext: false });
  const s = createServer(createMcpHttpHandler(tools, { onRequest: (e) => logs.push(e), ...opts }));
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { s, url: `http://127.0.0.1:${(s.address() as AddressInfo).port}` };
}

before(async () => ({ s: srv, url: base } = await start()));
after(() => srv.close());

const connect = async () => {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return client;
};
const text = (r: any) => (r.content as { text: string }[])[0].text;
const rpc = (body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

test("SDK client over HTTP: list + call, no tenant args exposed", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  const resolve = tools.find((t) => t.name === "resolve_goal")!;
  assert.ok(!("plan" in (resolve.inputSchema.properties as object)));
  assert.ok(!("permissions" in (resolve.inputSchema.properties as object)));
  assert.doesNotMatch(resolve.description!, /tenant/);

  // send-zalo-broadcast is plan-gated, so without tenant context availability is unknown.
  const r = await client.callTool({ name: "resolve_goal", arguments: { goal_id: "goal.send-zalo-broadcast" } });
  assert.match(text(r), /Availability: unknown \(no tenant context\)/);
  await client.close();
});

test("tenant args are rejected over HTTP", async () => {
  const client = await connect();
  const r = await client.callTool({ name: "resolve_goal", arguments: { goal_id: "goal.send-zalo-message", plan: "enterprise" } });
  assert.equal(r.isError, true);
  assert.match(text(r), /additional properties/);
  await client.close();
});

test("stateless: concurrent calls, no session header", async () => {
  const res = await Promise.all(
    ["sched", "template approved", "connect zalo", "gửi tin nhắn hàng loạt"].map((q, i) =>
      rpc({ jsonrpc: "2.0", id: i, method: "tools/call", params: { name: "search_kb", arguments: { query: q, limit: 1 } } }),
    ),
  );
  for (const r of res) {
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("mcp-session-id"), null);
    assert.equal(r.headers.get("content-type")?.startsWith("application/json"), true);
  }
  const ids = await Promise.all(res.map(async (r) => JSON.parse(text((await r.json()).result)).hits[0].id));
  assert.deepEqual(ids, ["capability.broadcast.schedule", "state.zalo.template-approved", "procedure.channel.connect-zalo", "goal.send-zalo-broadcast"]);
});

test("routing: healthz, 404, 405 for GET/DELETE on /mcp", async () => {
  const h = await fetch(`${base}/healthz`);
  assert.equal(h.status, 200);
  const body = await h.json();
  assert.deepEqual(body, { ok: true, kb: { nodes: 17, edges: 20, errors: 0, warnings: 0 } }); // root path not leaked
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  for (const method of ["GET", "DELETE"]) {
    const r = await fetch(`${base}/mcp`, { method });
    assert.equal(r.status, 405);
    assert.equal(r.headers.get("allow"), "POST");
  }
});

test("malformed JSON and oversized bodies are rejected", async () => {
  const bad = await rpc("{not json");
  assert.equal(bad.status, 400);
  const big = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_kb", arguments: { query: "x".repeat(1_100_000) } } });
  assert.ok(big.status === 413 || big.status === 400, `status ${big.status}`);
});

test("access log entries include gateway request id", async () => {
  await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { "x-request-id": "req-123" });
  const e = logs.find((l) => l.requestId === "req-123");
  assert.ok(e && e.method === "POST" && e.path === "/mcp" && e.status === 200 && e.ms >= 0);
});

test("allowedHosts enables DNS-rebinding protection", async () => {
  const { s, url } = await start({ allowedHosts: ["kb.internal"] });
  try {
    const r = await fetch(`${url}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(r.status, 403); // Host is 127.0.0.1:port, not kb.internal
  } finally {
    s.close();
  }
});

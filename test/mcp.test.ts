import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKBTools, createMcpServer, SERVER_INSTRUCTIONS } from "../src/index.js";

const text = (r: any) => (r.content as { type: string; text: string }[])[0].text;

test("MCP in-memory: list tools, instructions, call, isError", async () => {
  const server = createMcpServer(await createKBTools(path.resolve("kb")));
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);

  assert.equal(client.getInstructions(), SERVER_INSTRUCTIONS);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 5);
  assert.equal(tools.find((t) => t.name === "search_kb")?.annotations?.readOnlyHint, true);

  const ok = await client.callTool({ name: "search_kb", arguments: { query: "template approved" } });
  assert.equal(ok.isError, undefined);
  assert.equal(JSON.parse(text(ok)).goals[0].id, "goal.send-zalo-message");

  const bad = await client.callTool({ name: "resolve_goal", arguments: { goal_id: "goal.nope" } });
  assert.equal(bad.isError, true);
  await client.close();
});

test("MCP stdio: built server binary end-to-end", async () => {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StdioClientTransport({ command: process.execPath, args: [path.resolve("dist/mcp/bin.js"), "--kb", path.resolve("kb")], stderr: "pipe" }),
  );
  const r = await client.callTool({ name: "resolve_goal", arguments: { goal_id: "goal.send-zalo-broadcast", plan: "pro" } });
  assert.match(text(r), /## Recommended: Send Zalo broadcast/);
  await client.close();
});

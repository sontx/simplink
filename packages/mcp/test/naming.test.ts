import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { KBTools } from "@sontx/simplink-core";
import { createMcpServer } from "@sontx/simplink-mcp";

test("MCP server identifies itself with the simp name", async () => {
  const tools: KBTools = {
    definitions: [],
    status: { root: "", nodes: 0, edges: 0, errors: 0, warnings: 0 },
    call: () => ({ content: "" }),
  };
  const server = createMcpServer(tools);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientTransport);

  assert.equal(client.getServerVersion()?.name, "simp-graph");
  await client.close();
});

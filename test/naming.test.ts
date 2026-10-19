import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer, type KBTools } from "../src/index.js";

const help = (script: string) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", path.resolve(script), "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test("CLI help uses the simp command names", () => {
  assert.match(help("src/cli.ts"), /^Usage: simp-lint\b/);
  assert.match(help("src/resolve-cli.ts"), /^Usage: simp-resolve\b/);
  assert.match(help("src/search-cli.ts"), /^Usage: simp-search\b/);
});

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

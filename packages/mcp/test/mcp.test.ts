import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpServer, SERVER_INSTRUCTIONS } from "@sontx/simplink-mcp";

const execFileAsync = promisify(execFile);

const text = (r: any) =>
  (r.content as { type: string; text: string }[])[0].text;

test("MCP in-memory: list tools, instructions, call, isError", async () => {
  const server = createMcpServer(
    await createKBTools(
      fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
    ),
  );
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientT);

  assert.equal(client.getInstructions(), SERVER_INSTRUCTIONS);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 5);
  assert.equal(
    tools.find((t) => t.name === "search_kb")?.annotations?.readOnlyHint,
    true,
  );

  const ok = await client.callTool({
    name: "search_kb",
    arguments: { query: "template approved" },
  });
  assert.equal(ok.isError, undefined);
  assert.equal(JSON.parse(text(ok)).goals[0].id, "goal.send-zalo-message");

  const bad = await client.callTool({
    name: "resolve_goal",
    arguments: { goal_id: "goal.nope" },
  });
  assert.equal(bad.isError, true);
  await client.close();
});

test("MCP stdio: built server binary end-to-end", async () => {
  const client = new Client({ name: "test", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        fileURLToPath(new URL("../dist/bin.js", import.meta.url)),
        "--kb",
        fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
      ],
      stderr: "pipe",
    }),
  );
  const r = await client.callTool({
    name: "resolve_goal",
    arguments: { goal_id: "goal.send-zalo-broadcast", plan: "pro" },
  });
  assert.match(text(r), /## Recommended: Send Zalo broadcast/);
  await client.close();
});

test("server binaries print usage for --help and exit 0", async () => {
  for (const [bin, usage] of [
    ["bin.js", /^Usage: simp-mcp \[--kb dir\]/],
    ["http-bin.js", /^Usage: simp-mcp-http \[--kb dir\]/],
  ] as const) {
    for (const flag of ["--help", "-h"]) {
      const { stdout } = await execFileAsync(process.execPath, [
        fileURLToPath(new URL(`../dist/${bin}`, import.meta.url)),
        flag,
      ]);
      assert.match(stdout, usage);
    }
  }
});

test("server binaries reject unknown options with exit 2 and a usage hint", async () => {
  for (const [bin, name] of [
    ["bin.js", "simp-mcp"],
    ["http-bin.js", "simp-mcp-http"],
  ] as const) {
    await assert.rejects(
      execFileAsync(process.execPath, [
        fileURLToPath(new URL(`../dist/${bin}`, import.meta.url)),
        "--bogus",
      ]),
      (error: { code?: number; stderr?: string }) => {
        assert.equal(error.code, 2);
        assert.match(error.stderr ?? "", /Unknown option '--bogus'/);
        assert.match(error.stderr ?? "", new RegExp(`Run ${name} --help`));
        assert.doesNotMatch(error.stderr ?? "", /\n\s+at /);
        return true;
      },
    );
  }
});

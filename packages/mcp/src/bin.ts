#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpServer } from "./server.js";

// stdout carries the MCP protocol: log to stderr only.
const log = (msg: string) => process.stderr.write(`[simp-mcp] ${msg}\n`);

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        kb: { type: "string", default: process.env.KB_DIR ?? "kb" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    log(`${(error as Error).message}\nRun simp-mcp --help for usage.`);
    process.exit(2);
  }
})();
if (values.help) {
  process.stdout.write(`Usage: simp-mcp [--kb dir]

Serves the KB tools over MCP stdio.
  --kb  KB directory (default: $KB_DIR or kb)
`);
  process.exit(0);
}
const root = path.resolve(values.kb!);

const tools = await createKBTools(root);
const s = tools.status;
log(
  `loaded ${root}: ${s.nodes} nodes, ${s.edges} edges, ${s.errors} error(s), ${s.warnings} warning(s)`,
);
if (s.errors)
  log("KB has lint errors; run simp-lint for details. Serving anyway.");

await createMcpServer(tools).connect(new StdioServerTransport());
log("ready on stdio");

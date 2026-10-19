#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpServer } from "./server.js";

// stdout carries the MCP protocol: log to stderr only.
const log = (msg: string) => process.stderr.write(`[simp-mcp] ${msg}\n`);

const { values } = parseArgs({ options: { kb: { type: "string", default: process.env.KB_DIR ?? "kb" } } });
const root = path.resolve(values.kb!);

const tools = await createKBTools(root);
const s = tools.status;
log(`loaded ${root}: ${s.nodes} nodes, ${s.edges} edges, ${s.errors} error(s), ${s.warnings} warning(s)`);
if (s.errors) log("KB has lint errors; run simp-lint for details. Serving anyway.");

await createMcpServer(tools).connect(new StdioServerTransport());
log("ready on stdio");

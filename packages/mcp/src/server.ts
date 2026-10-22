import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { KBTools } from "@sontx/simplink-core";

export const SERVER_INSTRUCTIONS =
  "Product knowledge base as a graph of goals, procedures, capabilities, states, and constraints. " +
  "Workflow: search_kb with the user's intent → resolve_goal on the best goal (or resolve_procedure for a standalone procedure) → " +
  "follow the plan: run CHECK steps, ask the user at CHOOSE steps unless the answer is known, and respect blocking constraints. " +
  "Call resolve_* again with known states/choices to get a shorter plan. Use get_node / get_related only for details the plan omits. " +
  "IDs like `crm:goal.x` belong to other products; use them as-is.";

/** MCP server exposing the KB tools. Transport-agnostic: connect stdio, in-memory, or HTTP. */
export function createMcpServer(tools: KBTools, version = "0.2.0"): McpServer {
  const server = new McpServer(
    { name: "simp-graph", version },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.definitions.map((d) => ({
      name: d.name,
      description: d.description,
      inputSchema: d.inputSchema as { type: "object"; [k: string]: unknown },
      annotations: d.annotations,
    })),
  }));

  server.server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const r = await tools.call(req.params.name, req.params.arguments ?? {});
    return {
      content: [{ type: "text" as const, text: r.content }],
      ...(r.isError ? { isError: true } : {}),
    };
  });

  return server;
}

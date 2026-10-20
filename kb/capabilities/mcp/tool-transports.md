---
type: capability
title: Expose KB tools over stdio or stateless HTTP
summary: Serves the five KB tools to MCP clients through a stdio process or a stateless Streamable HTTP endpoint, with workflow instructions.
aliases:
  - máy chủ MCP
  - MCP server
requires:
  - capability.planning.intent-search
  - capability.planning.plan-resolution
constrained_by:
  - constraint.mcp.loaded-snapshot
sources:
  - packages/mcp/src/server.ts
  - packages/mcp/src/http.ts
  - packages/mcp/src/bin.ts
  - packages/mcp/src/http-bin.ts
  - packages/mcp/README.md
---

`@sontx/simplink-mcp` publishes the server as `simp-graph`, version 0.2.0. It lists `search_kb`, `resolve_goal`, `resolve_procedure`, `get_node`, and `get_related`. Its instructions tell the agent to search, resolve the best goal, follow CHECK and CHOOSE steps, and respect blocking constraints.

- `simp-mcp` runs over stdio. Protocol messages use stdout, and logs go to stderr.
- `simp-mcp-http` serves stateless Streamable HTTP with JSON responses. It also serves `GET /healthz`, logs one JSON line per request, and shuts down cleanly on `SIGTERM` or `SIGINT`.
- In code, `createMcpServer(tools)` connects to any MCP transport, and `createMcpHttpHandler(tools, options)` returns a Node request listener for `http.createServer`.

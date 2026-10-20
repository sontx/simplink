---
type: state
title: An MCP client can list and call KB tools
summary: The MCP client is connected to a Simplink server and can list the KB tools and get results from them.
check: In the MCP client, list the server's tools and confirm that `search_kb`, `resolve_goal`, `resolve_procedure`, `get_node`, and `get_related` appear, then call `search_kb` with a known topic and confirm that it returns results.
satisfied_by:
  - procedure.mcp.start-stdio
  - procedure.mcp.start-http
sources:
  - packages/mcp/src/server.ts
  - packages/core/src/tools/core.ts
---

If results start with `[KB has N lint error(s); results may be incomplete]`, the connection works but the KB needs fixing.

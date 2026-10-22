---
type: procedure
title: Connect MCP to a simp or enable declared peers
summary: Serve federated KB tools through MCP by loading a local KB and its peers, or connect MCP to a running simp, static KB, or folder as the home product.
aliases: [kết nối MCP với simp, connect MCP to simp]
uses: [capability.mcp.tool-transports, capability.federation.peer-api]
constrained_by: [constraint.federation.mesh-limits]
sources:
  - packages/mcp/src/kb-source.ts
  - packages/mcp/src/bin.ts
  - packages/mcp/src/http-bin.ts
  - packages/mcp/src/server.ts
---

## Steps

1. To load a local product and its declared peers, configure the MCP client to start `simp-mcp --kb <kb>`. Use `--peer name=<url>` and `--peer-token name=<token>` for runtime overrides; add `--no-peers` to keep results local.
2. Alternatively, configure `simp-mcp --simp <url-or-folder>` to use a running simp's API base URL, a static KB URL, or a local folder as the home product. Do not combine `--simp` with `--kb`.
3. For a protected home endpoint, supply `--simp-token <token>` or `SIMP_TOKEN`. Use `--peer-timeout <ms>` for declared peer requests.
4. For Streamable HTTP clients, use the same source flags with `simp-mcp-http`, then connect the client to its `/mcp` endpoint. Apply the HTTP deployment controls described in [Start HTTP MCP](simp:///procedure.mcp.start-http).
5. Call `search_kb` and use returned IDs unchanged in `get_node` and `resolve_goal`. The home product's IDs are unqualified; other products use IDs such as `crm:goal.import-customers`.
6. Inspect source failures and warnings. A failed home connection prevents startup; a failed optional peer can leave useful local results available.

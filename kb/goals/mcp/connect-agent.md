---
type: goal
title: Give an AI agent access to KB tools
summary: Run a Simplink MCP server so that an AI agent or MCP client can search the KB and resolve plans through tools.
aliases:
  - kết nối AI agent với KB
  - cài MCP server
  - connect Claude to the KB
  - set up the MCP server
  - expose KB over MCP
when_to_use:
  - User wants their AI assistant to call the KB's search and planning tools.
  - User wants a desktop or IDE MCP client to use the KB.
  - User wants to host the KB tools as a shared HTTP service for several agents.
procedures:
  - procedure.mcp.start-stdio
  - procedure.mcp.start-http
sources:
  - packages/mcp/README.md
  - packages/mcp/src/bin.ts
  - packages/mcp/src/http-bin.ts
---

The user wants an AI agent to use the KB through the Model Context Protocol. A local client usually launches the stdio server; shared or remote use needs the HTTP server.

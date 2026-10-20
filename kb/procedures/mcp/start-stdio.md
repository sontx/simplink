---
type: procedure
title: Connect an MCP client through simp-mcp
summary: Configure an MCP client to launch simp-mcp over stdio with the KB directory, then confirm that the tools are listed.
aliases:
  - chạy simp-mcp
  - run simp-mcp
preconditions:
  - state.authoring.documents-exist
optional_preconditions:
  - state.authoring.no-lint-errors
produces:
  - state.mcp.tools-connected
uses:
  - capability.mcp.tool-transports
constrained_by:
  - constraint.mcp.loaded-snapshot
sources:
  - packages/mcp/src/bin.ts
  - packages/mcp/README.md
  - README.md
---

## Steps

1. Install `@sontx/simplink-mcp`, or build this repository so that `packages/mcp/dist/bin.js` exists.
2. In the MCP client's server configuration, set the command to `simp-mcp` (or `node <repo>/packages/mcp/dist/bin.js`) with the arguments `--kb /absolute/path/to/kb`. The `KB_DIR` environment variable also works.
3. Start or restart the MCP client so that it launches the server.
4. In the client's server log, confirm `loaded <path>: N nodes, ...` followed by `ready on stdio`.
5. List the server's tools in the client and call `search_kb` with a known topic.

## Failure handling

- If the log shows `KB has lint errors`, run `simp-lint` on the KB, fix the errors, and restart the client.
- `simp-mcp` accepts only `--kb` and `--help`; any other option exits with an `Unknown option` error.
- Do not wrap the command in a script that prints to stdout; stdout carries the MCP protocol.

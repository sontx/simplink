---
type: procedure
title: Serve KB tools through simp-mcp-http
summary: Start simp-mcp-http on a host and port, check /healthz, protect it with a gateway and allowlists, and point MCP clients at /mcp.
aliases:
  - chạy simp-mcp-http
  - run simp-mcp-http
preconditions:
  - state.authoring.documents-exist
optional_preconditions:
  - state.authoring.no-lint-errors
produces:
  - state.mcp.tools-connected
uses:
  - capability.mcp.tool-transports
constrained_by:
  - constraint.mcp.http-boundary
  - constraint.mcp.loaded-snapshot
sources:
  - packages/mcp/src/http-bin.ts
  - packages/mcp/src/http.ts
  - Dockerfile
  - README.md
---

## Steps

1. Run `simp-mcp-http --kb <dir> --port 3000`. Set `--host` (default `127.0.0.1`), `--path` (default `/mcp`), and `--max-body` as needed, or use `KB_DIR`, `HOST`, `PORT`, `MCP_PATH`, and `MAX_BODY_BYTES`.
2. Confirm the JSON log lines `kb loaded` and `listening`, which include the endpoint URL.
3. Request `GET http://<host>:<port>/healthz` and check `ok` and `kb.errors`.
4. If clients reach the server through another host name or from a browser, add `--allowed-host <host:port>` and `--allowed-origin <origin>` (repeatable).
5. If the server is reachable beyond loopback, put it behind a gateway that authenticates requests.
6. Configure the MCP client with the Streamable HTTP URL `http://<host>:<port>/mcp`.

## Failure handling

- To run the server in a container, follow [[procedure.mcp.deploy-docker]].
- A 405 response on the MCP path means the client used `GET` or `DELETE`; this stateless server accepts only `POST`.
- Edits to KB files need a server restart.

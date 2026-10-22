---
type: constraint
title: Configure the HTTP transport boundary explicitly
summary: simp-mcp-http has no authentication; keep it on loopback or behind an authenticating gateway, and set host and origin allowlists when it is reachable remotely.
severity: blocking
aliases:
  - bảo mật MCP HTTP
  - xác thực MCP server
  - MCP HTTP authentication
  - allowed hosts and origins
sources:
  - packages/core/src/federation/kb.ts
  - packages/mcp/src/http.ts
  - packages/mcp/src/http-bin.ts
  - packages/mcp/README.md
  - Dockerfile
---

## Access

- The HTTP transport does not authenticate requests. Authentication is expected from a gateway in front of it.
- `simp-mcp-http` listens on `127.0.0.1` by default. The Docker image sets `HOST=0.0.0.0`, so the container accepts connections on every interface.
- `--allowed-host` and `--allowed-origin` (or the comma-separated `ALLOWED_HOSTS` and `ALLOWED_ORIGINS` variables) turn on DNS-rebinding protection. A `Host` header must exactly equal a listed value, including any port (such as `localhost:3000`). A request with an `Origin` header must match a listed origin; requests without one are accepted. Rejected requests get 403. Without either list, no header check is made.

## Endpoints

- The MCP endpoint (default `/mcp`, set with `--path` or `MCP_PATH`) accepts only `POST`. The transport is stateless: there are no sessions and no server-initiated streams, and other methods return 405.
- `GET /healthz` returns `{"ok": true, "kb": {...}}` with node, edge, error, and warning counts, but not the KB path. It also lists `peers`: one entry per directly connected source (each declared peer, or the `--simp` home) with `simp`, `ok`, `ms`, and `error` when its manifest request failed. The list is empty for a local KB without peers. Other paths return 404.
- Request bodies are limited to 1,000,000 bytes by default (`--max-body` or `MAX_BODY_BYTES`).

## Tenant arguments

`simp-mcp-http` removes `plan` and `permissions` from the `resolve_goal` and `resolve_procedure` tools, so remote clients cannot claim a plan or permission. `simp-mcp` over stdio keeps them.

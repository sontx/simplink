---
type: procedure
title: Run a product's simp peer API
summary: Serve a KB with simp-node, configure its peer endpoints and optional authentication, and inspect health and manifest responses before linking clients.
aliases: [chạy máy chủ simp, run simp node]
requires: [procedure.federation.write-simp-doc]
uses: [capability.federation.peer-api]
constrained_by: [constraint.federation.mesh-limits]
sources:
  - packages/node/src/bin.ts
  - packages/node/src/server.ts
  - packages/node/src/config.ts
  - packages/node/src/http.ts
---

## Steps

1. Run `simp-node serve --kb <kb>`. The KB must have `simp.md`; the default listener is `127.0.0.1:3393` with API base path `/simp`.
2. Set `--host`, `--port`, and `--base-path`, or `HOST`, `PORT`, and `SIMP_BASE_PATH`, for the desired endpoint. `KB_DIR` supplies the KB path when `--kb` is omitted.
3. Override declared peer endpoints with repeatable `--peer crm=<url>` or `SIMP_PEERS` as comma-separated `name=url` pairs. Set `--peer-token crm=<token>` or `SIMP_PEER_TOKEN_CRM` for protected peers; hyphens in names become underscores in environment keys.
4. Optionally require a bearer token using `--token` or `SIMP_TOKEN`. Add repeatable `--allowed-host` and `--allowed-origin` entries as appropriate. Set `--max-hops` and `--peer-timeout` to change the defaults of 2 hops and 2000 ms.
5. Request `GET /healthz` and `GET /simp/v1/manifest` at the server's origin, adjusting the manifest path for a custom base. Check product name, lint error count, and serving modes. Send `Authorization: Bearer <token>` to protected peer API routes; health remains public.
6. To run the node inside your own Node.js app instead, call `startSimpNode({ kb, port, token, allowedOrigins })` from `@sontx/simplink-node`; its options mirror the flags, and it returns the API `url` and `close()`.
7. Share the API base URL with peer or MCP clients. Restart the server after local KB changes so it loads a fresh snapshot.

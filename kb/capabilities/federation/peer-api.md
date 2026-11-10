---
type: capability
title: Explore and resolve guidance across product knowledge bases
summary: Each named simp exposes its product manifest and local nodes, optionally forwards searches and lookups to declared peers, and can delegate remote planning.
aliases: [API liên kết cơ sở tri thức, federation peer API]
constrained_by: [constraint.federation.mesh-limits]
---

The peer API provides `GET /simp/v1/manifest` (product identity, peers, serving modes, the lint error count, and `issues`, the KB's lint findings with source lines; older nodes omit `issues`), `GET /simp/v1/nodes` (every local node without bodies, never forwarded), and `POST /simp/v1/explore`, `/simp/v1/lookup`, and, when delegate is served, `/simp/v1/resolve`. Its protocol version is 1. `GET /healthz` is public and reports KB status; it probes and lists peers only for requests with the bearer token. The base path can be configured. Browser apps need their origin in the node's allowed origins, or the `*` entry that allows any origin; only those origins get CORS headers, and preflights are answered without the token.

Search and lookup keep local IDs unqualified and use `<simp>:<node-id>` for remote results. [Write a manifest](simp:///procedure.federation.write-simp-doc) to declare product identity and peers. [Reference another simp](simp:///procedure.federation.reference-other-simp) without changing that product's IDs.

A peer can be a running simp node, a static HTTP KB, or a folder. Static publishing supports lookup without an index; publish `simp-index.yaml` to enable search. [Connect MCP](simp:///procedure.mcp.connect-to-simp-node) to expose the home simp through the standard KB tools.

In code, `@sontx/simplink-node` exports `startSimpNode(options)`, which loads a KB, connects its declared peers, listens, and returns the API `url` and `close()`. `createSimpNodeHandler(options)` returns a request listener to mount on your own `http.createServer`, and `httpPeer(url)` and `openPeer(url)` connect to peers.

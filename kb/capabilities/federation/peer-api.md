---
type: capability
title: Explore and resolve guidance across product knowledge bases
summary: Each named simp exposes its product manifest and local nodes, optionally forwards searches and lookups to declared peers, and can delegate remote planning.
aliases: [API liên kết cơ sở tri thức, federation peer API]
constrained_by: [constraint.federation.mesh-limits]
sources:
  - packages/core/src/federation/protocol.ts
  - packages/core/src/federation/service.ts
  - packages/core/src/federation/kb.ts
  - packages/node/src/http.ts
  - packages/node/src/open-peer.ts
---

The peer API provides `GET /simp/v1/manifest` and `POST /simp/v1/explore`, `/simp/v1/lookup`, and, when delegate is served, `/simp/v1/resolve`. Its protocol version is 1. `GET /healthz` is public and reports KB status; it probes and lists peers only for requests with the bearer token, and it honours the host and origin allowlists. The base path can be configured.

Search and lookup keep local IDs unqualified and use `<simp>:<node-id>` for remote results. [Write a manifest](simp:///procedure.federation.write-simp-doc) to declare product identity and peers. [Reference another simp](simp:///procedure.federation.reference-other-simp) without changing that product's IDs.

A peer can be a running simp node, a static HTTP KB, or a folder. Static publishing supports lookup without an index; publish `simp-index.yaml` to enable search. [Connect MCP](simp:///procedure.mcp.connect-to-simp-node) to expose the home simp through the standard KB tools.

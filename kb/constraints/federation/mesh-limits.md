---
type: constraint
title: Respect federation limits and remote availability
summary: Federation limits hops and peer timeouts, isolates tenant context, and reports remote availability as unchecked; optional bearer authentication protects peer access.
severity: blocking
aliases: [giới hạn liên kết sản phẩm, federation limits]
sources:
  - packages/core/src/federation/service.ts
  - packages/core/src/federation/prefetch.ts
  - packages/node/src/http-peer.ts
  - packages/node/src/http.ts
  - packages/node/src/static-peer.ts
---

Federation defaults to two hops, a 2000 ms timeout per peer, and a 60 second manifest cache. Each request tracks visited simps to avoid forwarding loops. Search scores decay by 0.9 per hop; unavailable sources are reported without discarding successful results.

Tenant plans, permissions, and satisfied states stay local. Remote nodes receive the warning `availability of <id> not checked`; a returned remote plan does not prove the user can execute it.

A simp serves pull by default. Delegate resolution must be explicitly declared. Static HTTP and folder peers only support pull and never forward. Static publishing accepts at most 5000 indexed files and 20000000 response bytes; paths and redirects must stay within the KB root.

A peer API may require `Authorization: Bearer <token>`. Set tokens through flags or environment variables, never in `simp.md`. Optional Host and Origin allowlists constrain HTTP access; choose deployment access controls for the intended audience.

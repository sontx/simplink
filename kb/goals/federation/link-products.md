---
type: goal
title: Link products and search guidance across their knowledge bases
summary: Connect product knowledge bases as named simps so searches, references, and plans span products while each product keeps its own Markdown and IDs.
aliases:
  - liên kết sản phẩm
  - tìm hướng dẫn nhiều sản phẩm
  - link products
  - federate product knowledge bases
when_to_use:
  - I want to link products whose workflows depend on each other.
  - An agent needs to search or plan across multiple product knowledge bases.
  - Tôi muốn kết nối các cơ sở tri thức và lập kế hoạch qua nhiều sản phẩm.
procedures:
  - procedure.federation.reference-other-simp
  - procedure.federation.run-simp-node
  - procedure.federation.publish-static-simp
  - procedure.mcp.connect-to-simp-node
sources:
  - packages/core/src/federation/kb.ts
  - packages/node/src/open-peer.ts
  - packages/mcp/src/kb-source.ts
---

Give each product a named simp and declare relationships to other products. Choose linked authoring, a running peer API, static publishing, or an MCP connection according to how the products share guidance.

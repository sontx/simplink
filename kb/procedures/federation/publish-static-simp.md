---
type: procedure
title: Publish a static simp or share a KB folder
summary: Share a KB without running a simp server; generate simp-index.yaml when static HTTP peers need search, and regenerate it after changes.
aliases: [xuất bản simp tĩnh, share static knowledge base]
requires: [procedure.federation.write-simp-doc]
uses: [capability.federation.peer-api]
constrained_by: [constraint.federation.mesh-limits]
sources:
  - packages/core/src/cli/index-file.ts
  - packages/core/src/cli/simp.ts
  - packages/core/src/simp-index.ts
  - packages/node/src/static-peer.ts
  - packages/node/src/folder-peer.ts
  - packages/node/src/open-peer.ts
---

## Steps

1. Validate the KB with `simp-lint <kb>` and keep `simp.md` at its root.
2. For static HTTP publishing, run `simp-index <kb>` (or `simp index <kb>`) to write `simp-index.yaml`. Publish this index to enable search; without it, static peers support ID-based lookup and pull planning only.
3. Copy the KB's source Markdown files, preserving paths, to an HTTP server with `simp.md` at the shared base URL. Publish the source KB rather than generated reader documentation. Avoid an SPA fallback that returns HTML for missing Markdown paths.
4. Alternatively, share the source KB folder directly through a local path or `file://` URL. Folder peers can search the loaded KB without a published index.
5. Configure the shared URL or path as a peer's `url`, or run `simp-mcp --simp <url-or-folder>`. Relative peer paths resolve from the declaring KB root.
6. After static KB changes, rerun `simp-index <kb>` and republish files and index together. Consumers refresh metadata on a 60 second cache interval; static and folder peers only serve pull and never forward to further peers.

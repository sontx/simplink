---
type: procedure
title: Generate documentation pages in an application
summary: Call kb.docs() or exportDocs() to get Markdown pages as path and content pairs, then write or serve them yourself.
aliases:
  - dùng kb.docs
  - use exportDocs
preconditions:
  - state.authoring.no-lint-errors
uses:
  - capability.docs.markdown-export
  - capability.integration.extensible-facade
constrained_by:
  - constraint.docs.publication-lifecycle
sources:
  - packages/core/src/docs.ts
  - packages/core/src/kb.ts
  - packages/core/src/assets.ts
  - packages/core/README.md
---

## Steps

1. Load the KB with `const kb = await createKB("/path/to/kb", { resolve: { tenant } })` if guides should use tenant defaults.
2. Call `kb.docs()` for the site layout, or `kb.docs({ layout: "graph" })` for the graph layout.
3. To override resolve options for one export, pass them too, for example `kb.docs({ tenant: { plan: "basic" } })`.
4. Pass `locale`, for example `kb.docs({ locale: "vi" })`, to choose the language of generated wording. `kb.docs` defaults to the `language` field in `simp.md`. To add a language or change wording, pass partial messages through `createKB(dir, { locales: { ja: { docs: { steps: "手順" } } } })`.
5. Without a facade, call `exportDocs(graph, options)`; it uses only the options you pass, and English unless you set `locale`.
6. Write or serve each returned `{ path, content }` page; these functions write nothing themselves.
7. If nodes link local images, copy each path returned by `docAssets(kb.graph)` from the KB to the same relative path beside the pages. Pass the source graph, not a site layout graph.

## Failure handling

- `Duplicate docs path` or `Invalid docs path` means two nodes publish to the same path, or a `docs.path` is invalid; fix the frontmatter.
- Unlike `simp-docs`, these functions do not reject KBs with lint errors, so check `kb.status.errors` before publishing the pages.

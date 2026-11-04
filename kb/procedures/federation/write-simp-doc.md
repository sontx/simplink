---
type: procedure
title: Declare a product simp and its peers
summary: Add root simp.md with a stable product name, homepage, optional peer declarations, and optional serving modes; validate it before connecting products.
aliases: [viết tài liệu simp, write simp manifest]
constrained_by:
  [constraint.authoring.document-format, constraint.federation.mesh-limits]
sources:
  - packages/core/schemas/simp.schema.json
  - packages/core/src/loader.ts
  - packages/core/src/lint-graph.ts
---

## Steps

1. Create `simp.md` directly inside the KB root. Add frontmatter `type: simp`, `name`, `title`, and `summary`. Use a stable lowercase kebab-case `name`, such as `crm`.
2. Write a product introduction and entry-goal links in the body, such as `[Import customers](simp:///goal.import-customers)`. Docs export uses this document as its homepage.
3. Add `peers` entries with unique `name` values that differ from this simp's own name. Optionally set `url` to an HTTP endpoint, static KB URL, `file://` URL, or folder path relative to the KB root.
4. Optionally set a peer's `mode` to `pull` or `delegate` and `docs_url` to the root of its published graph-layout docs export (`simp-docs --layout graph`). Remote links use ID-derived paths, so a site-layout export or a frontmatter docs path breaks them. Add the product's own `docs_url` when published.
5. Optionally set `language`, such as `vi`, to make that language the default for generated docs and plan wording. Callers can still choose another language.
6. Keep the default `serves: [pull]`, or explicitly add `delegate` when this simp should resolve remote plans. Keep credentials outside the manifest.
7. Run `simp-lint <kb>` and fix errors, including duplicate or self peer names. A peer without a URL can still be referenced; supply its endpoint later through runtime configuration.

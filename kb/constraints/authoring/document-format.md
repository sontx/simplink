---
type: constraint
title: Follow node paths and frontmatter schemas
summary: Each node is a Markdown file under a type folder, with an ID derived from its path and frontmatter that matches the bundled schema for its type.
severity: blocking
aliases:
  - định dạng tệp node
  - quy tắc đặt tên đường dẫn
  - node file format
  - frontmatter schema
---

## Paths and IDs

- Only `.md` files are loaded; other files, such as images under `assets/`, are left alone. Files directly in the KB root (such as `INVENTORY.md`) and any path segment starting with `.` are ignored.
- The first folder sets the node type: `goals/`, `procedures/`, `capabilities/`, `states/`, or `constraints/`. Other folders produce `E003`.
- The ID is the type followed by the remaining path segments, joined with dots: `procedures/billing/update-card.md` becomes `procedure.billing.update-card`.
- Every segment after the type folder must be lowercase kebab-case (`a-z`, `0-9`, single hyphens). Dots, underscores, and uppercase letters produce `E004`.
- The optional `id` field must equal the path-derived ID (`E002`). Omit it.
- Two files with the same ID produce `E001`; only the first is kept.

## Frontmatter

- The file must start with a `---` YAML block (`E013`). Quote values that contain `: ` or start with `[`, `{`, `*`, `&`, `!`, or `@`.
- `type` must match the folder (`E003`).
- Every node needs `type`, `title`, and `summary` (`E006`).
- Goals need `when_to_use` and `procedures`, each with at least one item. States need `check` and at least one `satisfied_by` procedure. Constraints need `severity: blocking` or `severity: warning`.
- Unknown keys are errors (`E005`). Optional common keys are `aliases`, `tags`, `related`, `status` (`active` or `deprecated`), `availability` (`plans`, `permissions`), and `docs` (`path`, `order`). `sources` is still accepted but deprecated (`W112`).
- Record each node's evidence (repo paths or doc URLs) in `simp-sources.yaml` at the KB root, keyed by node ID. Frontmatter is served to agents and peers; the sidecar never is.
- Relationship fields accept only IDs of the expected type; for example, `uses` accepts only `capability.*` IDs (`E008`). Other type or enum violations produce `E012`.

## When violated

Files with path, folder, YAML, or duplicate-ID errors are left out of the graph. Files with schema errors stay in the graph so graph rules can still report on them. Any error makes `simp-search`, `simp-resolve`, and `simp-docs` refuse the KB; see [[constraint.authoring.graph-rules]].

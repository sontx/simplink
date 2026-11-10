---
type: procedure
title: Add screenshots to procedures and states
summary: Put image files in the KB, link them as Markdown images inside procedure steps or state bodies with alt text, then lint and check the plan.
aliases:
  - chèn ảnh vào bước
  - thêm ảnh minh họa cho node
  - add an image to a step
  - embed screenshots in nodes
preconditions:
  - state.authoring.documents-exist
uses:
  - capability.planning.plan-resolution
  - capability.docs.markdown-export
constrained_by:
  - constraint.authoring.document-format
  - constraint.authoring.graph-rules
sources:
  - packages/core/src/assets.ts
  - packages/core/src/resolve.ts
  - packages/core/src/render.ts
  - packages/core/src/lint-graph.ts
  - packages/core/src/platform.ts
  - packages/core/README.md
---

## Steps

1. Save the image files inside the KB, in a folder such as `assets/<area>/`. The loader reads only `.md` files, so images never become nodes. Keep them out of folders and files whose names start with `.`, which are never published.
2. In a procedure, write the image as an ordinary Markdown image inside the `## Steps` item it belongs to, on the item's line or indented under it, with a path relative to the node file: `![Settings page with the Save button highlighted](../../assets/settings/save.webp)`. Images written before the first item belong to no step.
3. In a state, write the image anywhere in the body to show what the state looks like when it is true. In other node types, images appear in exported pages but not in plans.
4. Write alt text that describes the screen and the highlighted control. Agents never see the image; plans give them only the alt text.
5. Run `simp-lint <kb>` and fix `W110` (the image file is missing or outside the KB) and `W111` (the image has no alt text).
6. Run `simp-resolve <goalId> --kb <kb>` and confirm the alt text appears as a `Screen:` line under the right step or check.
7. Export with `simp-docs --kb <kb> --out <output>` and open a goal guide: each image appears under its step, and the image files are copied beside the pages at their KB paths.

## Failure handling

- An image inside inline code or a fenced code block is ignored by plans, lint, and export.
- External image URLs (`https://…`) and absolute paths stay in the text as written; they are neither checked nor copied, and plans keep them in the step text.
- `W110` is not reported for in-memory or Git sources, which cannot list image files; a custom source reports it only if it implements `assets()`.

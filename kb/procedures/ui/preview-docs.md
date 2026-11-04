---
type: procedure
title: Browse generated docs and download Markdown
summary: Open Docs, pick the Site or Graph layout, browse the generated pages, and download a page or the complete layout as a ZIP.
aliases:
  - xem trước tài liệu
  - preview docs in the UI
preconditions:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
  - capability.docs.markdown-export
constrained_by:
  - constraint.docs.publication-lifecycle
sources:
  - packages/ui/src/routes/docs/$.tsx
  - packages/ui/src/components/node-docs.tsx
  - packages/ui/src/workspace/service.ts
  - README.md
---

## Steps

1. Open **Docs** in the sidebar.
2. Choose **Site** or **Graph** under **Docs layout**.
3. Choose the language in the header's language menu. Generated headings and steps in the preview, the downloads, and agent plans follow it. Node content is shown as written.
4. Browse the pages with the navigation, the breadcrumb, **Previous** and **Next**, and **On this page**.
5. To see where a node is published, open the node and select its **Docs** tab, then **Open docs**.
6. Select **Markdown** to download the current page.
7. Select **Download docs (.zip)** to download all generated Markdown pages for the selected layout, preserving folders and relative links. This works in folder and memory modes; assets are not included.
8. Review the pages before publishing. Like the preview, the ZIP can include pages from a KB with lint errors; `simp-docs` requires a valid KB.

## Failure handling

- The preview works even when the KB has lint errors and shows `{count} lint errors · Preview is available, but simp-docs would refuse to export.`
- Invalid or duplicate `docs.path` values stop the **Site** preview with the reason, such as `Duplicate docs path: <path>`. Fix the node's `docs` frontmatter in **Source**; the **Graph** layout still works meanwhile.

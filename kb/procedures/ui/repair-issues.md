---
type: procedure
title: Repair lint findings and reload external changes
summary: Open Issues, jump to each affected file's source, fix and save it, and use Reload after editing files outside the UI.
aliases:
  - sửa vấn đề trong UI
  - fix issues in the UI
preconditions:
  - state.ui.workspace-running
produces:
  - state.authoring.no-lint-errors
uses:
  - capability.ui.local-manager
  - capability.authoring.graph-validation
constrained_by:
  - constraint.ui.local-write-boundary
  - constraint.authoring.document-format
  - constraint.authoring.graph-rules
sources:
  - packages/ui/web/src/routes/issues.tsx
  - packages/ui/web/src/routes/__root.tsx
  - packages/ui/web/src/routes/nodes/$id.tsx
  - packages/ui/src/server.ts
---

## Steps

1. Open **Issues**, and set **Severity** to **Errors** to start with blocking findings.
2. For an issue on a loaded node, select **Source ↗** to open that file in the editor, fix it, and select **Save file**.
3. For an issue marked `Fix this file on disk, then Reload`, edit the file in another editor; files with path or YAML errors are not loaded as nodes.
4. After editing files outside the UI, select **Reload** in the header.
5. Repeat until **Issues** shows **All clear**, or only warnings you accept.

## Failure handling

- Saving reloads the KB automatically; a finding that remains after saving still needs a fix.
- Use **Only with issues** on **Graph** to see affected nodes in context.

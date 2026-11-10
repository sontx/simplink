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
  - constraint.ui.browser-folder-access
  - constraint.authoring.document-format
  - constraint.authoring.graph-rules
---

## Steps

1. Open **Issues**, and set **Severity** to **Errors** to start with blocking findings.
2. For a file that loaded as a node, select **Fix in source** (or a finding's **Line**) to open it in the editor, fix it, and select **Save file**. Use **Next file** to move on. Open **What these codes mean** below the list for a plain explanation of each code.
3. A file marked "This file can't be opened here" has path or YAML errors and did not load as a node. Edit it in another editor.
4. In directory mode, select **Reload** after editing files outside the UI. In memory mode, Reload keeps your in-memory edits and does not reread the original folder; download the zip before opening the folder again.
5. Repeat until **Issues** shows **All clear**, or only warnings you accept.

## Failure handling

- Saving reloads the KB automatically; a finding that remains after saving still needs a fix.
- Use **Only with issues** on **Graph** to see affected nodes in context.

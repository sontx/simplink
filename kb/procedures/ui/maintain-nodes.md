---
type: procedure
title: Create and maintain nodes with the source editor
summary: Create a node from the Nodes page or the graph canvas, then complete its fields in the Source tab and save the file.
aliases:
  - tạo nút trong UI
  - create a node in the UI
preconditions:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
constrained_by:
  - constraint.ui.browser-folder-access
  - constraint.authoring.document-format
---

## Steps

1. To create a node, open **Nodes** and select **Add goal**, or **Add other node types** and then **Add {type}**; on **Graph**, you can instead right-click the canvas and select **New {type} here…**.
2. Enter the **Path within {folder}** in lowercase kebab-case (for example `messaging/send-message`), a **Title**, and a **Summary**, then select **Create node**.
3. To edit an existing node, open it from **Nodes**, the graph, or **Search nodes…**, and select the **Source** tab.
4. Edit the Markdown in the editor. New goals start with an empty `procedures` list and new states with an empty `satisfied_by` list, so add at least one procedure to each.
5. Select **Save file**, and confirm that the save succeeds. In memory mode, download the KB zip to keep the saved edits.
6. Check the header counts or **Issues** for findings that the save introduced.

## Failure handling

- If a file already exists at the path, creation fails; choose another path.
- Leaving a node page with unsaved edits asks `Discard unsaved changes?`.
- New constraints default to `severity: warning`; change it to `blocking` when the rule must always be shown.

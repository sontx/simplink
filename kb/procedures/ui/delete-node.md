---
type: procedure
title: Delete a node file and repair its references
summary: Check which nodes link to a node, update them, delete the file from the Source tab, and confirm that no new errors appear.
aliases:
  - xóa tệp nút
  - delete a node file
preconditions:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
constrained_by:
  - constraint.ui.local-write-boundary
  - constraint.ui.git-clone-lifecycle
  - constraint.authoring.graph-rules
sources:
  - packages/ui/web/src/routes/nodes/$id.tsx
  - packages/ui/web/src/components/inspector.tsx
  - packages/ui/src/server.ts
---

## Steps

1. Open the node, and review the **Incoming** list under **Relationships** on its **Overview** tab.
2. For each incoming node, retarget or remove the relationship with the inspector's **×** or in its **Source** tab.
3. Return to the node, select the **Source** tab, and select **Delete file**.
4. Read the confirmation: `{path} will be permanently deleted.` and the number of nodes that still reference it, then select **Delete file** to confirm.
5. Open **Issues** and fix any `E007` errors for references that still point to the deleted node.

## Failure handling

- Deletion cannot be undone in the UI. For a Git-backed KB, restore the file with Git in the clone folder, for example `git restore <path>`, and then select **Reload**.
- To retire a node without breaking links, set `status: deprecated` instead; references to it then show warning `W104`.

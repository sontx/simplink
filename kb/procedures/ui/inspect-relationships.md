---
type: procedure
title: Inspect nodes, edit relationships, and preview plans
summary: Select a node in the graph, add or remove typed relationships in the inspector or by connecting nodes, and open the resolved plan.
aliases:
  - sửa quan hệ giữa các nút
  - edit node relationships
preconditions:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
constrained_by:
  - constraint.ui.browser-folder-access
  - constraint.authoring.graph-rules
sources:
  - packages/ui/src/components/inspector.tsx
  - packages/ui/src/components/kb-graph.tsx
  - packages/ui/src/routes/graph.tsx
  - packages/ui/src/workspace/service.ts
---

## Steps

1. Open **Graph**, narrow the view with **Node types**, **Relationships**, and **Depth** if needed, and select a node to open the **NODE INSPECTOR**.
2. To add a relationship, select **+** next to a relationship kind such as **Preconditions** or **Uses**, then pick the target in the **Find {type}…** list; only targets of the allowed type are offered.
3. To remove a relationship, select **×** next to its target.
4. To connect two nodes on the canvas, drag from one node to another, then pick the relationship kind in **Connect nodes**.
5. For a goal or procedure, select **Plan** to view the **Agent plan** that an agent would receive.
6. To edit `choices` or body links, select **Open editor** and change them in the **Source** tab.

## Failure handling

- `No valid relationship kinds for these node types.` means the schema allows no relationship from the source type to the target type.
- Relationship edits change only the selected frontmatter field; the rest of the file keeps its formatting.

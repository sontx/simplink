---
type: capability
title: Browse and edit a KB with live validation
summary: A local browser app to explore the graph, edit node files, manage relationships, review issues, preview plans, and preview docs.
aliases:
  - trình quản lý KB
  - local KB manager
  - browser KB workspace
requires:
  - capability.authoring.graph-validation
  - capability.planning.plan-resolution
  - capability.docs.markdown-export
constrained_by:
  - constraint.ui.browser-folder-access
sources:
  - packages/ui/src/workspace/service.ts
  - packages/ui/src/routes/__root.tsx
  - packages/ui/src/routes/graph.tsx
  - packages/ui/src/routes/nodes/index.tsx
  - packages/ui/src/routes/issues.tsx
  - packages/ui/src/routes/docs/$.tsx
  - packages/ui/src/lib/i18n.ts
  - README.md
---

`@sontx/simplink-ui` ships a static browser app. Open a KB folder from the open screen; Chromium saves directly to it, while other browsers use memory and zip downloads. The main views are:

- **Graph**: the knowledge graph, with filters for **Node types**, **Relationships**, **Depth**, **Show deprecated**, and **Only with issues**, plus an **Orphans** list. **State** and **Constraint** are unchecked by default; enable them under **Node types** to show them. Select a node to open the **NODE INSPECTOR**.
- **Nodes**: a table filterable by title or ID, type, status, and tag. Each node page has **Overview**, **Source**, and **Docs** tabs.
- **Issues**: lint findings, filterable by **Severity**.
- **Docs**: an in-memory preview of the exported docs in **Site** or **Graph** layout, with current-page Markdown and full-layout ZIP downloads.

The header shows the error and warning counts, **Search nodes…**, **Reload**, a language switch (English or Vietnamese), and a theme toggle. Goal and procedure pages show the resolved **Agent plan**.

All KB operations run in the browser. There is no UI server API. The header shows the folder name and actions to open another folder or close it. Unsaved memory changes are guarded when closing, switching folders, reloading, or refreshing the page.

Refreshing automatically restores the last selected directory when the browser still grants read/write permission. If permission must be renewed, use **Reopen** on the open screen. Memory workspaces do not persist across refreshes.

---
type: capability
title: Browse and edit a KB with live validation
summary: A local browser app to explore the graph, edit node files, manage relationships, review issues, preview plans, and preview docs.
aliases:
  - trình quản lý KB
  - local KB manager
  - simp-ui
requires:
  - capability.authoring.graph-validation
  - capability.planning.plan-resolution
  - capability.docs.markdown-export
constrained_by:
  - constraint.ui.local-write-boundary
  - constraint.ui.git-clone-lifecycle
sources:
  - packages/ui/src/server.ts
  - packages/ui/web/src/routes/__root.tsx
  - packages/ui/web/src/routes/graph.tsx
  - packages/ui/web/src/routes/nodes/index.tsx
  - packages/ui/web/src/routes/issues.tsx
  - packages/ui/web/src/routes/docs/$.tsx
  - packages/ui/web/src/lib/i18n.ts
  - README.md
---

`@sontx/simplink-ui` provides the `simp-ui` command. The main views are:

- **Graph**: the knowledge graph, with filters for **Node types**, **Relationships**, **Depth**, **Show deprecated**, and **Only with issues**, plus an **Orphans** list. Select a node to open the **NODE INSPECTOR**.
- **Nodes**: a table filterable by title or ID, type, status, and tag. Each node page has **Overview**, **Source**, and **Docs** tabs.
- **Issues**: lint findings, filterable by **Severity**.
- **Docs**: an in-memory preview of the exported docs in **Site** or **Graph** layout.

The header shows the error and warning counts, **Search nodes…**, **Reload**, a language switch (English or Vietnamese), and a theme toggle. Goal and procedure pages show the resolved **Agent plan**.

Applications can mount the same server with `createUiHandler(kbPathOrGitUrl)`, which returns an Express app. Its HTTP API is internal to the UI and undocumented.

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
  - packages/ui/src/routes/playground.tsx
  - packages/ui/src/routes/issues.tsx
  - packages/ui/src/routes/docs/$.tsx
  - packages/ui/src/lib/i18n.ts
  - README.md
---

`@sontx/simplink-ui` ships a static browser app. Open a KB folder from the open screen; Chromium saves directly to it, while other browsers use memory and zip downloads. The main views are:

- **Graph**: the knowledge graph, with filters for **Node types**, **Relationships**, **Depth**, **Show deprecated**, and **Only with issues**, plus an **Orphans** list. **State** and **Constraint** are unchecked by default; enable them under **Node types** to show them. Select a node to open the **NODE INSPECTOR**.
- **Nodes**: a table filterable by title or ID, type, status, and tag. Each node page has **Overview**, **Source**, and **Docs** tabs.
- **Playground**: friendly forms for **Find answers**, **Plan a goal**, **Plan a procedure**, **View details**, and **Explore connections**, using the same validated tools as MCP against the current workspace. Plans accept known conditions, choices, account plan, and permissions. These actions read data and provide guidance; they do not execute procedures or change files.
- **Issues**: lint findings grouped by file, files with the most errors first, filterable by **Severity**. Each file has **Graph** and **Fix in source**; selecting a finding's **Line** opens the Source tab at that line. On the Source tab, the file's findings sit above the editor, which marks their lines; **Next file** moves to the next file with issues, and **Ctrl+S** (**⌘S** on macOS) saves.
- **Docs**: an in-memory preview of the exported docs in **Site** or **Graph** layout, with current-page Markdown and full-layout ZIP downloads.

The header shows the error and warning counts, **Search nodes…**, **Reload**, a language button showing **en** or **vi** with a dropdown listing **en English** and **vi Tiếng Việt**, and a separate theme toggle showing a sun for light mode and a moon for dark mode. The default theme is light; saved theme choices are preserved. Goal and procedure pages show the resolved **Agent plan**.

All KB operations run in the browser. There is no UI server API. The header shows the folder name and actions to open another folder or close it. That menu and the navigation rail's footer name the workspace mode: **Folder** (changes save straight to disk), **Memory** (download the KB to keep changes), or **Remote** (read-only). In a read-only workspace, the node inspector offers **View source** instead of **Open editor**. Unsaved memory changes are guarded when closing, switching folders, reloading, or refreshing the page.

The open screen can also connect to a simp node by URL and optional token. That workspace is a read-only snapshot of the node's own KB, rebuilt from its nodes; editing controls are hidden. Its Issues view shows the node's own lint findings from the manifest, so files and values the rebuild cannot reproduce still appear; line numbers refer to the node's original files and are not links. In any workspace, Playground tools also reach peers that `simp.md` declares with an `http(s)` simp-node URL; peers that need a token are not supported there.

Refreshing automatically restores the last selected directory when the browser still grants read/write permission. If permission must be renewed, use **Reopen** on the open screen. A connected simp node is restored on refresh within the same browser tab. Memory workspaces do not persist across refreshes.

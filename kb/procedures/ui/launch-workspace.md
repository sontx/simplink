---
type: procedure
title: Open a folder in the browser workspace
summary: Start the static UI, choose a KB folder, grant access, and check the loaded workspace.
aliases:
  - mở thư mục KB trong trình duyệt
  - open the browser workspace
produces:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
constrained_by:
  - constraint.ui.browser-folder-access
sources:
  - packages/ui/web/src/workspace/context.tsx
  - packages/ui/web/src/workspace/service.ts
  - package.json
  - README.md
---

## Steps

1. Run `pnpm build` and `pnpm ui` in this repository, or use `pnpm dev:ui` during development. Open the URL Vite prints.
2. Select **Open KB folder**, choose the local KB folder, and grant read/write access. Git URLs are not supported; clone a repository yourself first.
3. In Chromium, edits are saved directly to the folder. Other browsers load a memory copy and show **Changes saved in memory — download to keep them**.
4. Confirm the folder name and lint counts in the header. Browse Graph, Nodes, Issues, or Docs.
5. In memory mode, use **Download KB (.zip)** to keep changes and unchanged assets. Dot-files and dot-folders such as `.git` are excluded.
6. After a refresh in Chromium, select **Reopen <name>** and grant read/write permission again. If browser storage is unavailable, use **Open KB folder** instead.

## Failure handling

- Folder access needs HTTPS or localhost. Use a Chromium browser for direct writes.
- Cancelling leaves the open screen usable. Denied permissions show an error; open the folder again and grant access.
- Close or Open another folder asks for confirmation when the memory copy has edits. Reload keeps those edits; refreshing the page loses the memory workspace unless you downloaded it.

---
type: constraint
title: Grant browser folder access and keep memory edits
summary: Direct folder writes need Chromium, a secure context, and permission; other browsers edit in memory and require a zip download to keep changes.
severity: blocking
aliases:
  - quyền truy cập thư mục trình duyệt
  - browser folder permission
  - download memory edits
sources:
  - packages/ui/web/src/workspace/store.ts
  - packages/ui/web/src/workspace/persist.ts
  - packages/ui/web/src/workspace/context.tsx
  - packages/ui/web/src/workspace/service.ts
  - README.md
---

- Use Chromium for direct read/write access to the chosen folder. Folder access requires HTTPS or localhost.
- The browser asks for permission when opening a folder. **Reopen <name>** requests read/write permission again from the button click; unavailable IndexedDB hides Reopen.
- Other browsers read the picked folder into memory. Edits survive **Reload** in that workspace, but refreshing the page loses them. Use **Download KB (.zip)** to keep edits and unchanged assets.
- Close, opening another folder, Reload, and page refresh guard dirty memory workspaces. Reload explains that edits are kept.
- Dot-files and dot-folders, including `.git`, are excluded. Git URLs are unsupported; clone repositories yourself.
- Writes and reloads run in order. Failed writes report errors. If rebuilding fails after a save, Reload retries while the last valid graph remains visible.
- File paths must be relative Markdown paths under a node type folder with no empty, dot, parent, or backslash segments.

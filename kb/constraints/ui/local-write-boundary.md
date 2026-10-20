---
type: constraint
title: Use the UI as a local file editor
summary: simp-ui has no authentication, writes directly to the KB files, and accepts API requests only with a 127.0.0.1 or localhost Host header.
severity: blocking
aliases:
  - giao diện chỉ dùng cục bộ
  - UI has no authentication
  - local only UI
sources:
  - packages/ui/src/server.ts
  - packages/ui/src/bin.ts
  - README.md
---

- The UI server has no authentication. It listens on `127.0.0.1` by default; use it only on your own machine.
- API requests and all changes require a `Host` header of `127.0.0.1`, `localhost`, or one of those with the server's port. Other host names, including `[::1]` or a LAN address, get `API requests require a local Host header` (403), so the UI does not work remotely even with `--host 0.0.0.0`. No `Origin` check is made.
- Changes must be sent as `application/json` and are limited to 1 MB per request.
- Saves, new nodes, relationship edits, and deletions write directly to the files in the KB folder and reload the lint results. Deleting a file is permanent. Experiment on a copy of the KB.
- File paths must be Markdown files under a node type folder, and must stay inside the KB folder; paths through symbolic links that leave it are rejected.
- Changes are processed one at a time.

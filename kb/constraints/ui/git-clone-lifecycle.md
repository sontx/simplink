---
type: constraint
title: Manage Git synchronization outside the UI
summary: For a Git URL, the UI edits a persistent local clone in ~/.simplink/repos and never pulls, resets, commits, or pushes; run Git there yourself.
severity: warning
aliases:
  - đồng bộ Git cho UI
  - commit thay đổi từ UI
  - UI git clone
  - push UI changes
sources:
  - README.md
  - packages/ui/src/server.ts
  - packages/core/src/git-source.ts
---

- `--kb` values starting with `https://`, `http://`, `ssh://`, `git://`, or `file://`, or of the form `user@host:path`, are treated as Git URLs. Other values are local directories.
- The repository is cloned once into `~/.simplink/repos/<hash of the URL>`, and the server prints `Git KB clone: <path>` at startup.
- The repository root must contain the node type folders; a KB subfolder cannot be selected from the UI.
- Saves stay in that clone and survive restarts. The existing clone is reused without pulling, resetting, committing, or pushing.
- **Reload** reads the local files only. To publish or update, run `git status`, `git commit`, `git pull`, and `git push` in the printed clone folder, then select **Reload**.
- Git must be installed. Private repositories use your existing Git credentials or SSH configuration.

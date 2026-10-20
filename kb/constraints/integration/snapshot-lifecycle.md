---
type: constraint
title: Recreate snapshots after source changes
summary: A loaded KB is a fixed snapshot; it does not watch files or pull from Git, so create a new KB after documents change.
severity: warning
aliases:
  - KB không tự cập nhật
  - làm mới snapshot
  - reload KB in code
  - stale snapshot
sources:
  - packages/core/README.md
  - packages/core/src/kb.ts
  - packages/core/src/git-source.ts
---

- `createKB` reads, validates, and indexes the documents once. Its `graph`, `issues`, `status`, and search index never change afterwards.
- Changes to files or a Git repository are not picked up until `createKB` is called again. `createKBTools` and servers built from it keep the snapshot they were created with.
- A `gitSource` without `checkout` makes a fresh shallow clone on every load and deletes it afterwards.
- A `gitSource` with `checkout` reads the local clone as it is, including uncommitted edits. It never pulls, resets, commits, pushes, or deletes the clone; run Git in that folder yourself, then recreate the KB.
- File watching and special handling for Git submodules or Git LFS are not provided.

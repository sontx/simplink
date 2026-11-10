---
type: constraint
title: Meet document-source and Git checkout requirements
summary: Sources must return unique relative POSIX paths; Git sources need Git, non-interactive credentials, a branch or tag ref, and a folder inside the repository.
severity: blocking
aliases:
  - yêu cầu nguồn tài liệu
  - lỗi clone git
  - custom document source
  - git source requirements
---

## All sources

- A source is `fsSource(root)`, `memorySource(files, name?)`, or any object with `list()` that returns `{ relPath, content }` entries, either directly or as a promise.
- Each `relPath` must be relative and `/`-separated, with no backslashes, empty, `.` or `..` segments, or drive prefixes, and must be unique. Otherwise loading fails with `Invalid source path` or `Duplicate source path`.
- Non-Markdown files, paths with a segment starting with `.`, and files in the root folder are ignored.
- An optional `assets()` method returns the relative paths of non-Markdown files, directly or as a promise, so lint can report missing images (`W110`). `fsSource` implements it, including symlinked images that stay inside the KB; `memorySource` and `gitSource` do not, so they skip that check.
- An optional `read(relPath)` method returns a non-Markdown text file, or `undefined` when it is missing, so lint can check `simp-sources.yaml` (`E017`, `W113`). `fsSource` and `memorySource` implement it. `gitSource` returns only the `simp-sources.yaml` captured by its latest `list()`, because its temporary clone is deleted afterwards. A read failure, such as the path being a folder, is reported as `E017` instead of failing the load.

## Git sources

- Git must be installed. Private repositories use your existing Git credentials or SSH configuration; credential prompts are disabled, so missing credentials fail instead of waiting.
- `ref` is a branch or tag (the clone uses `--branch`) and defaults to the repository's default branch. Clones are shallow and time out after two minutes.
- `directory` must be a relative folder inside the repository. Absolute paths, backslashes, `..`, and folders that resolve outside the repository are rejected.
- An existing `checkout` folder must be a clone whose `origin` URL equals `repo`; otherwise loading fails with `Git checkout belongs to a different repository`. `ref` applies only when the clone is first created.
- Clone and read errors are passed to the caller.

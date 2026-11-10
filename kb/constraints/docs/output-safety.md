---
type: constraint
title: Use valid, disjoint documentation destinations
summary: simp-docs needs a lint-clean KB and a separate output directory, and checks every destination for duplicates, links, and unsafe paths before it writes anything.
severity: blocking
aliases:
  - thư mục xuất tài liệu
  - lỗi simp-docs
  - docs output directory
  - unsafe output destination
sources:
  - packages/core/src/cli/docs.ts
  - packages/core/src/docs-layout.ts
  - packages/core/schemas/defs.schema.json
  - README.md
---

## Before writing

- `--out` is required and must not be blank. `--layout` is `site` (the default) or `graph`.
- The KB must have no lint errors (`KB has N lint error(s); run simp-lint <dir> first.`).
- The KB and output directories must not contain each other, including through symbolic links (`KB and output directories must not overlap`). An existing output path must be a directory.
- Every page destination must stay inside the output directory and outside the KB. A dangling symbolic link in the path is rejected.
- An existing destination must be a regular file that is not hardlinked (`Refusing to overwrite hardlinked output page`, or `output image` for a copied image). Image destinations get the same checks as pages.
- Images in hidden paths (a segment starting with `.`) and `.md` targets are never copied.

## Publication paths

- `docs.path` must be a relative POSIX `.md` path with lowercase kebab-case segments; `index.md` is reserved for generated landing pages.
- `docs.order` must be a nonnegative integer.
- Two nodes that publish to the same path stop the export with `Duplicate docs path`.

Any violation stops the command with exit code 2 before the first file is written.

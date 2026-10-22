---
type: procedure
title: Export Markdown with simp-docs
summary: Run simp-docs with a KB and a dedicated output directory to write a Markdown guide site or graph layout.
aliases:
  - chạy simp-docs
  - run simp-docs
  - simp docs
preconditions:
  - state.authoring.no-lint-errors
uses:
  - capability.docs.markdown-export
constrained_by:
  - constraint.docs.output-safety
  - constraint.docs.publication-lifecycle
sources:
  - packages/core/src/cli/docs.ts
  - packages/core/src/cli/simp.ts
  - README.md
---

## Steps

1. Optionally set `docs.path` and `docs.order` in node frontmatter to place pages, for example in a getting-started section.
2. Choose an empty output directory outside the KB.
3. Run `simp-docs --kb <dir> --out <output>` (or `simp docs` with the same options) for the guide site, or add `--layout graph` for one page per node at its source path. In an interactive terminal, `simp docs` without `--out` asks for the output directory.
4. Confirm that the command prints `Wrote N page(s) to <output>.`
5. Review the generated Markdown and copy any assets your site engine needs before you publish it.

## Failure handling

- Exit code 2 with a message means a check failed or a write failed; fix the reported problem and run the command again.
- If pages from removed nodes remain, export into a fresh directory.

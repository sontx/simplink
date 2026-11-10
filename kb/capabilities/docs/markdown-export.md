---
type: capability
title: Generate site or graph documentation layouts
summary: Turns a KB into reader-facing Markdown pages, either as a guide site with landing pages or as one page per node at its source path.
aliases:
  - xuất tài liệu Markdown
  - Markdown docs export
requires:
  - capability.planning.plan-resolution
constrained_by:
  - constraint.docs.output-safety
  - constraint.docs.publication-lifecycle
sources:
  - packages/core/src/docs.ts
  - packages/core/src/docs-layout.ts
  - packages/core/src/docs-plan.ts
  - packages/core/src/assets.ts
  - packages/core/src/i18n/index.ts
  - README.md
---

## Site layout (default)

Goals become guides with the full walkthrough, choices, restrictions, and resolver warnings. Blocking constraints are listed under **Before you start**, ahead of the steps (one needed only by a conditional fix says when it applies; one needed only by a choice option is shown at that option instead), and warning constraints under **Good to know**, after them; the graph layout keeps a single **Constraints** list with each item labeled **Blocking:** or **Warning:**. Default locations keep each node's folders under its type:

| Node type  | Default path                          |
| ---------- | ------------------------------------- |
| Goal       | `guides/<folders>/<name>.md`          |
| Procedure  | `guides/<folders>/how-to/<name>.md`   |
| Capability | `guides/<folders>/features/<name>.md` |
| Constraint | `reference/<folders>/<name>.md`       |
| State      | `troubleshooting/<folders>/<name>.md` |

The site has a home page and an `index.md` landing page for each directory. A source file named `index.md` is published as `overview.md`.

Optional `docs.path` frontmatter moves a page, for example to `getting-started/connect.md`, without changing its node ID. `docs.order` sorts navigation: smaller numbers come first, folders use their earliest page's order, and unordered entries follow, with task pages first.

## Graph layout

`graph` keeps the original source paths and graph headings, ignores `docs` metadata, and generates no landing pages.

In both layouts, `[[id]]` wikilinks become relative links that follow the published paths, and code examples stay literal.

## Images

Images are Markdown images in node bodies, with paths relative to the node file. Exported pages rewrite those paths to follow the published location; external URLs and images in code stay as written. Goal guides show each step's images under the step, and each state's images with its check. `simp-docs` copies every referenced image beside the pages at its KB path and skips missing ones; library callers copy the paths that `docAssets(graph)` returns.

## Output language

Generated wording, such as headings, section titles, step phrasing, availability labels, and resolver warnings, is written in one language. English (`en`) and Vietnamese (`vi`) are built in. The language comes from the `--lang` option or the `locale` option, then from the `language` field in `simp.md`, and otherwise defaults to English. Region tags such as `vi-VN` use their base language, and unknown codes fall back to English. Node content is published as written, and page paths stay the same in every language.

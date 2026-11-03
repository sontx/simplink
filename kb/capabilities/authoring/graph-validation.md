---
type: capability
title: Validate schemas and graph relationships
summary: Checks every Markdown node against its type schema and the graph rules, and reports coded errors and warnings with file paths.
aliases:
  - kiểm tra knowledge base
  - lint KB
  - KB validation
constrained_by:
  - constraint.authoring.document-format
  - constraint.authoring.graph-rules
sources:
  - packages/core/src/lint.ts
  - packages/core/src/lint-graph.ts
  - packages/core/src/schema.ts
  - packages/core/src/kb.ts
---

Validation loads every Markdown file, checks paths and frontmatter against the bundled JSON schemas, builds the graph, and runs the graph rules. Each finding has a code (`E*` for errors, `W*` for warnings), a file path, and a message. Most findings also have a `line`, the 1-based line in the source file: the frontmatter field, list item, or body text that caused it, or the YAML error position. Findings about the whole file, such as a missing required field or an orphan node, have no line. `simp-lint` prints it as `line 12:` before the message. Findings are sorted by path, with errors before warnings.

The same validation runs in `simp-lint`, when an application loads a KB, when an MCP server starts, and in the local UI's Issues view. The UI groups findings by file and opens the editor at a finding's line. A KB with errors still loads, but the search, resolve, and docs CLIs refuse it.

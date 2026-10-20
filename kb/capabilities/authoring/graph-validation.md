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

Validation loads every Markdown file, checks paths and frontmatter against the bundled JSON schemas, builds the graph, and runs the graph rules. Each finding has a code (`E*` for errors, `W*` for warnings), a file path, and a message. Findings are sorted by path, with errors before warnings.

The same validation runs in `simp-lint`, when an application loads a KB, when an MCP server starts, and in the local UI's Issues view. A KB with errors still loads, but the search, resolve, and docs CLIs refuse it.

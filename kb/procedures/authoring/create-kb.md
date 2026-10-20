---
type: procedure
title: Write linked Markdown knowledge-base nodes
summary: Create the type folders and write goal, procedure, capability, state, and constraint files with frontmatter and links.
aliases:
  - viết node KB
  - write KB nodes
produces:
  - state.authoring.documents-exist
constrained_by:
  - constraint.authoring.document-format
  - constraint.authoring.graph-rules
sources:
  - packages/core/src/loader.ts
  - packages/core/src/graph.ts
  - packages/core/schemas/
  - test/fixtures/kb/
---

## Steps

1. Create a KB directory with the folders `goals/`, `procedures/`, `capabilities/`, `states/`, and `constraints/`.
2. Add one Markdown file per node with a lowercase kebab-case name. Subfolders become ID segments, so `procedures/billing/update-card.md` has the ID `procedure.billing.update-card`.
3. Start each file with a `---` frontmatter block that contains `type`, `title`, and `summary`.
4. Add the required fields for each type: `when_to_use` and `procedures` for goals, `check` and `satisfied_by` for states, and `severity` for constraints.
5. Link procedures to other nodes with `requires`, `preconditions`, `optional_preconditions`, `produces`, `uses`, and `constrained_by`. Use `[[id]]` wikilinks in bodies for soft links.
6. Write each procedure's `## Steps` section as an ordered list, and add a `choice:<id>` step for each entry in `choices`.
7. Add `aliases` to each goal so that users can find it in their own words.
8. Validate the result with `simp-lint <dir>`.

## Failure handling

- If `simp-lint` reports errors, fix them as described in [[procedure.authoring.lint-kb]].

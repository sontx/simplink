---
type: procedure
title: Search a knowledge base with simp-search
summary: Run simp-search with the user's words to list matching goals and nodes, optionally filtered by type.
aliases:
  - chạy simp-search
  - run simp-search
  - simp search
preconditions:
  - state.authoring.no-lint-errors
uses:
  - capability.planning.intent-search
constrained_by:
  - constraint.planning.cli-validation
---

## Steps

1. Run `simp-search <query...> --kb <dir>`, or `simp search <query...> --kb <dir>`, with the user's words as the query. In an interactive terminal, `simp search` without a query asks for one.
2. To restrict the hits to node types, add `--type procedure` (repeatable), and set the number of hits with `--limit N` (default 10).
3. Read `Goals:` for ranked entry points; each line shows relevance, the goal ID, and the nodes it was reached through.
4. Read `Hits:` for matching nodes of any type and the words that matched.
5. Pass the best goal ID to `simp-resolve` to get its plan.

## Failure handling

- Add `--format json` to get machine-readable results.
- If no goal appears, try other words, or add aliases and `when_to_use` entries to the goal you expected.

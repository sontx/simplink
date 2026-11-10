---
type: procedure
title: Load, query, resolve, and render with createKB
summary: Load a KB with createKB, check its status, then search, resolve, and render plans from application code.
aliases:
  - dùng createKB
  - use createKB
preconditions:
  - state.authoring.documents-exist
optional_preconditions:
  - state.authoring.no-lint-errors
uses:
  - capability.integration.extensible-facade
constrained_by:
  - constraint.integration.snapshot-lifecycle
  - constraint.integration.source-contract
---

## Steps

1. Install `@sontx/simplink-core` in a Node.js 22+ ESM project.
2. Load the KB with `const kb = await createKB("/path/to/kb")`, or pass `memorySource({ "goals/x.md": "..." })` for documents held in memory.
3. Check `kb.status.errors` and `kb.issues` before serving results.
4. Find entry points with `const found = await kb.search("user words")` and read `found.goals` and `found.hits`.
5. Build a plan with `kb.resolveGoal(goalId, { states, choices, tenant })`, or `kb.resolveProcedure(procedureId, ...)`.
6. Render it for a model with `await kb.render(resolved, { tokenBudget: 1500 })` and use the returned `text`.
7. To give a model tool access, create `const tools = await createKBTools(kb)`, pass `tools.definitions` to your provider, and run each tool call with `await tools.call(name, args)`.

## Failure handling

- `tools.call()` returns a promise from version 0.2.0 on; `await` every call.
- Library methods pass extension errors to the caller; tools return them as error results.

---
type: capability
title: Embed a KB snapshot with configurable behavior
summary: The createKB facade loads a KB from files, memory, or Git once, then searches, resolves, renders, and exports it, with replaceable behavior.
aliases:
  - thư viện simplink-core
  - createKB facade
requires:
  - capability.authoring.graph-validation
  - capability.planning.intent-search
  - capability.planning.plan-resolution
constrained_by:
  - constraint.integration.snapshot-lifecycle
  - constraint.integration.source-contract
sources:
  - packages/core/src/kb.ts
  - packages/core/src/source.ts
  - packages/core/src/tools/core.ts
  - packages/core/src/index.ts
  - packages/core/README.md
---

`@sontx/simplink-core` is an ESM package for Node.js 20 or newer, with TypeScript declarations and the bundled schemas.

- `createKB(input, extensions?)` accepts a directory path or a document source and returns a snapshot with `graph`, `issues`, and `status` (`root`, `nodes`, `edges`, `errors`, `warnings`).
- Its methods are `node(id)`, `search(query, opts)` (async), `resolveGoal(id, opts)`, `resolveProcedure(id, opts)`, `render(resolved, opts)` (async), and `docs(opts)`.
- `createKBTools(kb)` provides the five provider-independent tool definitions (`search_kb`, `resolve_goal`, `resolve_procedure`, `get_node`, `get_related`) and an async `call(name, args)`.
- Sources, validation, lint rules, search, availability and ranking, rendering, and tool sets can be replaced through extensions.
- The standalone functions `loadDocs`, `lintKB`, `createValidator`, `createSearchIndex`, `resolveGoal`, `resolveProcedure`, and `renderResolvedGoal` remain available and are synchronous where documented.

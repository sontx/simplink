---
type: procedure
title: Configure core extensions and KB tool definitions
summary: Pass KBExtensions to createKB, or tool options to createKBTools, to replace validation, lint, search, resolution, rendering, or tools.
aliases:
  - cấu hình KBExtensions
  - configure KBExtensions
uses:
  - capability.integration.extensible-facade
constrained_by:
  - constraint.integration.source-contract
  - constraint.integration.snapshot-lifecycle
sources:
  - packages/core/README.md
  - packages/core/src/kb.ts
  - packages/core/src/tools/core.ts
  - packages/core/src/cli/context.ts
---

## Steps

1. Pass a `KBExtensions` object as the second argument to `createKB(input, extensions)`.
2. To change validation, set `validator(type, data)` to return schema findings; it replaces the bundled schema check, while path, folder, ID, and YAML checks still run.
3. To add or silence lint rules, set `lint.rules` to functions that return issues, and `lint.disable` to warning codes such as `W101`.
4. To change retrieval, set `search(graph)` to return a search engine, or build the default one with `createMiniSearchEngine(graph, { stopwords, fold, boosts })`.
5. To change plans, set `resolve.availability`, `resolve.rank`, `resolve.maxDepth`, or default `resolve.tenant` values, including a `tenant.context` you fetched beforehand.
6. To change plan output, set `renderer(resolved, opts)`, or keep the default renderer and pass a `sections` hook in its render options.
7. To change the tool set, call `createKBTools(input, { extensions, tools: (defaults, kb) => specs, tenantContext })`, where each spec has a `definition` and a `handler(args, kb)`.
8. To use the same extensions in the CLI runners, pass them as `extensions` in the second argument of `runLint`, `runSearch`, `runResolve`, or `runDocs`.

## Failure handling

- Disabling an `E*` code throws before loading; replace the validator to relax schemas instead.
- `extensions cannot be supplied with an existing KB`: pass extensions to `createKB`, then pass the KB to `createKBTools` without them.
- `Duplicate tool name`: return each tool name once from the `tools` callback.
- Availability policies and rank comparators must be synchronous; fetch remote data first and put it in `tenant.context`.
- Throw `ToolError` in a handler to return its message to the model; other exceptions become internal tool errors.

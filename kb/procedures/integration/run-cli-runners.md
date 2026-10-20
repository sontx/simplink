---
type: procedure
title: Run KB checks in tests with the CLI runners
summary: Call runLint, runSearch, runResolve, or runDocs in process with CLI arguments, capture their output, and assert on the exit code.
aliases:
  - dùng runLint trong kiểm thử
  - use runLint in tests
preconditions:
  - state.authoring.documents-exist
uses:
  - capability.authoring.graph-validation
  - capability.integration.extensible-facade
constrained_by:
  - constraint.authoring.graph-rules
  - constraint.planning.cli-validation
sources:
  - packages/core/README.md
  - packages/core/src/cli/lint.ts
  - packages/core/src/cli/context.ts
  - packages/core/src/index.ts
---

## Steps

1. Import the runners from `@sontx/simplink-core`, for example `import { runLint, runResolve } from "@sontx/simplink-core"`.
2. Call a runner with the same arguments as its CLI, for example `await runLint(["kb", "--max-warnings", "0"], { stdout, stderr })`, where `stdout` and `stderr` collect lines.
3. To apply custom validation or lint rules, pass them as `extensions`, for example `{ extensions: { lint: { disable: ["W101"] } } }`.
4. Assert that the returned code is 0; on failure, report the collected lines.
5. Check a key plan the same way with `await runResolve(["<goalId>", "--kb", "kb"], { stdout, stderr })`.

## Failure handling

- Runners return `0`, `1`, or `2` and never set `process.exitCode` or exit the process, so the test must check the returned code.
- Each callback call is one message without a trailing newline; JSON or Markdown output can span several lines in one message.

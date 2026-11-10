---
type: procedure
title: Fail CI builds on KB errors with simp-lint
summary: Run simp-lint in a CI job with a warning limit, so that invalid or degraded KB changes fail the build.
aliases:
  - chạy simp-lint trong CI
  - run simp-lint in CI
preconditions:
  - state.authoring.documents-exist
uses:
  - capability.authoring.graph-validation
constrained_by:
  - constraint.authoring.document-format
  - constraint.authoring.graph-rules
---

## Steps

1. Add a CI job that installs Node.js 22 or newer and `@sontx/simplink-core`.
2. Run `simp-lint <dir> --max-warnings 0` to fail on any error or warning, or set a higher limit to allow known warnings.
3. Add `--format json` when the CI system should parse the findings, or `--quiet` to print errors only.
4. Optionally smoke-test a key plan with `simp-resolve <goalId> --kb <dir>`, which exits with a nonzero code if the KB has errors or the goal is missing.
5. Optionally run `simp-docs --kb <dir> --out <empty-dir>` to confirm that the docs export succeeds.
6. Let the job fail on any nonzero exit code.

## Failure handling

- Exit code 1 from `simp-lint` means findings; exit code 2 means a usage or loading problem, such as a wrong directory.
- To silence a warning code for the whole KB, use the library's `lint.disable` option through `runLint` instead of raising the limit.

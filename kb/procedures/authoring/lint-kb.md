---
type: procedure
title: Validate a knowledge base with simp-lint
summary: Run simp-lint, fix each reported error, and run it again until the KB has zero errors.
aliases:
  - chạy simp-lint
  - run simp-lint
preconditions:
  - state.authoring.documents-exist
produces:
  - state.authoring.no-lint-errors
uses:
  - capability.authoring.graph-validation
constrained_by:
  - constraint.authoring.document-format
  - constraint.authoring.graph-rules
sources:
  - packages/core/src/cli/lint.ts
  - packages/core/README.md
---

## Steps

1. Run `simp-lint <dir>`. The directory defaults to `kb`.
2. Read the findings under each file path. Codes that start with `E` are errors; codes that start with `W` are warnings.
3. Fix each error in the named file, using the rule for its code.
4. Run `simp-lint <dir>` again until the final line reports `0 error(s)`.
5. Review the remaining warnings, and fix the ones that show real gaps, such as orphans (`W101`) or goals without aliases (`W102`).

## Failure handling

- Exit code 1 means errors were found, or warnings exceeded `--max-warnings N`.
- Exit code 2 means the command failed before linting. Causes include an unknown option, an invalid `--format` or `--max-warnings` value, more than one directory, and an unreadable KB.
- In CI, use `--format json` for machine-readable output, `--quiet` to list errors only, and `--max-warnings N` to fail when there are more than `N` warnings. The default, `-1`, never fails on warnings.

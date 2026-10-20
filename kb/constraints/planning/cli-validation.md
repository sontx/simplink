---
type: constraint
title: Use valid KBs and CLI argument values
summary: simp-search and simp-resolve refuse KBs with lint errors and reject invalid options, both with exit code 2.
severity: blocking
aliases:
  - lỗi tham số CLI
  - CLI exit code 2
  - invalid CLI option
sources:
  - packages/core/src/cli/search.ts
  - packages/core/src/cli/resolve.ts
  - packages/core/src/cli/context.ts
---

## KB health

Both commands load the KB first. If it has any lint error, they print `KB has N lint error(s); run simp-lint <dir> first.` and exit with code 2. Fix the KB with `simp-lint`; see [[state.authoring.no-lint-errors]].

## `simp-search`

- At least one query word is required (`Missing search query`).
- `--type` accepts `goal`, `procedure`, `capability`, `state`, or `constraint`, and can be repeated.
- `--limit` must be an integer of at least 1. The default is 10.
- `--format` is `text` (the default) or `json`.

## `simp-resolve`

- Exactly one goal ID is required. The CLI resolves goals only; procedures are resolved with the `resolve_procedure` tool or the library.
- `--state` must be `id=true` or `id=false`, and can be repeated.
- `--choice` must be `choiceId=key` or `procedureId:choiceId=key`, and can be repeated.
- `--budget` must be an integer of at least 1. The default is 2000.
- `--format` is `md` (the default) or `json`.

## Exit codes

`0` means success. `2` means an argument, loading, or execution failure; the reason is printed on stderr.

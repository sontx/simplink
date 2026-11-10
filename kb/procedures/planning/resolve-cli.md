---
type: procedure
title: Resolve a goal with simp-resolve
summary: Run simp-resolve with a goal ID and any known states, choices, and tenant details to print an ordered plan.
aliases:
  - chạy simp-resolve
  - run simp-resolve
  - simp resolve
preconditions:
  - state.authoring.no-lint-errors
uses:
  - capability.planning.plan-resolution
constrained_by:
  - constraint.planning.cli-validation
  - constraint.planning.availability-context
---

## Steps

1. Find the goal ID, for example with `simp-search`. In an interactive terminal you can skip this: `simp resolve --kb <dir>` without a goal ID lists the KB's goals to filter and pick from.
2. Run `simp-resolve <goalId> --kb <dir>`, or `simp resolve <goalId> --kb <dir>`; both accept the same options.
3. Add what you already know: `--state <stateId>=true|false` for known states and `--choice <choiceId>=<key>` (or `<procedureId>:<choiceId>=<key>`) for decisions already made.
4. To evaluate availability, add `--plan <plan>` and `--permission <permission>` (repeatable).
5. Add `--lang <code>`, such as `--lang vi`, for plan wording in another language. Without it, the `language` field in `simp.md` is used, or else English. JSON output stays in English.
6. Read the plan: **CHECK** steps verify a state and say what to run if it is false, **RUN** steps run a procedure, and **CHOOSE** steps branch. A `Screen:` line under a step describes the screenshot the KB has for it. In other languages these labels are translated, for example **KIỂM TRA**, **THỰC HIỆN**, and **CHỌN** in Vietnamese.
7. Adjust `--budget N` (default 2000) if sections were omitted, or use `--format json` for the full structured result.

## Failure handling

- The token estimate and any omitted sections are printed on stderr after the plan.

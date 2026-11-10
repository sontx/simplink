---
type: constraint
title: Keep executable graph dependencies valid
summary: References must resolve, dependencies must not form cycles, and procedure, goal, and choice bodies must follow the step conventions; warnings flag quality problems.
severity: blocking
aliases:
  - quy tắc đồ thị
  - lỗi tham chiếu node
  - graph lint rules
  - dangling reference
sources:
  - packages/core/src/lint-graph.ts
  - packages/core/src/graph.ts
  - packages/core/src/markdown.ts
  - packages/core/src/assets.ts
---

## Errors (block search, resolution, and export)

| Code   | Rule                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `E007` | Every local frontmatter reference and body link must point to an existing node. Declared remote refs are checked online.         |
| `E016` | A qualified reference must use this simp's own name or a peer declared in `simp.md`.                                             |
| `E009` | `requires` edges and choice option procedures must not form a cycle.                                                             |
| `E010` | Every procedure needs a `## Steps` section with an ordered list (`1. ...`).                                                      |
| `E011` | Goal bodies must not contain a `## Steps` section or an ordered list; steps belong in procedures.                                |
| `E014` | Each choice must be referenced exactly once in `## Steps` as its own item `choice:<id>`, and no step may name an unknown choice. |
| `E015` | Choice IDs must be unique within a procedure, and option keys unique within a choice.                                            |

Code in backticks or fenced blocks is ignored when finding links and steps.

## Warnings (reported, never blocking)

| Code   | Meaning                                                                             |
| ------ | ----------------------------------------------------------------------------------- |
| `W101` | A node other than a goal or simp has no incoming references (orphan).               |
| `W102` | A goal has no aliases.                                                              |
| `W103` | A summary is longer than 200 characters.                                            |
| `W104` | An active node references a deprecated node.                                        |
| `W105` | The same alias (case-insensitive) is used by more than one goal.                    |
| `W106` | No procedure `produces` a state.                                                    |
| `W107` | A procedure's `availability` is wider than a capability it `uses`.                  |
| `W109` | A peer is unreachable during `simp-node lint --peers`; remote existence is unknown. |
| `W108` | A choice has only one option.                                                       |
| `W110` | A body image's file is missing or outside the KB (filesystem sources only).         |
| `W111` | An image has no alt text; agents read only the alt text.                            |

`simp-lint` exits with code 1 on any error. Warnings affect the exit code only when `--max-warnings` is exceeded.

Use canonical Markdown links such as `[Local guide](simp:///procedure.area.task)` or `[Remote guide](simp://crm/goal.import)`. Wikilinks remain supported. Offline lint validates the peer declaration and target ID type; `simp-node lint --peers <kb>` checks remote existence and reports remote type mismatches as E003.

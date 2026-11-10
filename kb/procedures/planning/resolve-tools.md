---
type: procedure
title: Resolve a goal or procedure through KB tools
summary: Call resolve_goal or resolve_procedure with known states, choices, tenant details, and a token budget to get a Markdown plan.
aliases:
  - gọi resolve_goal
  - call resolve_goal
optional_preconditions:
  - state.authoring.no-lint-errors
uses:
  - capability.planning.plan-resolution
constrained_by:
  - constraint.planning.availability-context
sources:
  - packages/core/src/tools/core.ts
---

## Steps

1. Get a goal or procedure ID from `search_kb`.
2. Call `resolve_goal` with `goal_id`, or `resolve_procedure` with `procedure_id` for a standalone procedure.
3. Add known facts to shorten the plan: `states` as `{"<stateId>": true}` and `choices` as `{"<choiceId>": "<key>"}` or `{"<procedureId>:<choiceId>": "<key>"}`.
4. Add `plan` and `permissions` when the tenant is known, so that alternatives are ranked by availability.
5. Set `token_budget` (200 to 8000, default 2000) to fit the plan into the agent's context.
6. Optionally set `language` (for example `"vi"`) to get the plan wording in that language. It defaults to the `language` field in `simp.md`, then English. Node content is returned as written.
7. Follow the returned Markdown plan, and ask the user to confirm each **CHECK** step and decide each **CHOOSE** step. A `Screen:` line is the alt text of that step's screenshot; use it to tell the user what they should see.

## Failure handling

- Passing a procedure ID to `resolve_goal` (or a goal ID to `resolve_procedure`) fails with a hint naming the right tool.
- The `plan` and `permissions` arguments are missing when tenant context is disabled, as on `simp-mcp-http`; configured tenant defaults still apply.
- Call `get_node` for details that the plan omitted, such as a constraint's full rules.
- To get tool access, see [[goal.integration.embed-kb]] for in-process use or [[goal.mcp.connect-agent]] for MCP clients.

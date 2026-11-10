---
type: procedure
title: Search and inspect guidance through KB tools
summary: Call search_kb with the user's intent, then get_node or get_related for details and dependencies.
aliases:
  - gọi search_kb
  - call search_kb
optional_preconditions:
  - state.authoring.no-lint-errors
uses:
  - capability.planning.intent-search
constrained_by:
  - constraint.planning.availability-context
---

## Steps

1. Call `search_kb` with `query` set to the user's intent in their own words. Optionally set `types` and `limit` (1 to 25, default 8).
2. Take the best entry from `goals` and pass its ID to `resolve_goal`.
3. If a hit is a procedure with no goals, pass its ID to `resolve_procedure` instead.
4. To read a node's fields, edges, and body, call `get_node` with `id`. `max_body_chars` defaults to 3000; set it to 0 to omit the body.
5. To answer "what depends on X?" or "what does X need?", call `get_related` with `id`, a `direction` (`in`, `out`, or `both`), and optionally `depth` (1 to 3), `kinds`, and `limit`.

## Failure handling

- `Node "<id>" not found` includes up to three similar IDs; retry with one of them, or call `search_kb`.
- `Invalid arguments for <tool>` names the field that failed validation.
- The tools are the same in process (`createKBTools`, see [[goal.integration.embed-kb]]) and over MCP (see [[goal.mcp.connect-agent]]).

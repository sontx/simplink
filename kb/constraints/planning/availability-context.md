---
type: constraint
title: Treat availability and token budgets as planning context
summary: Plan and permission inputs only rank and label alternatives, they do not enforce access, and token budgets are approximate limits that core plan sections can exceed.
severity: warning
aliases:
  - giới hạn token
  - gói dịch vụ và quyền
  - availability is not access control
  - token budget
---

## Availability

- Nodes can declare `availability.plans` and `availability.permissions`. The tenant plan and permissions passed to resolution decide whether each alternative is available, unavailable, or unknown.
- Without tenant context, gated alternatives are reported as `unknown (no tenant context)`.
- Availability only ranks and labels alternatives. It does not hide nodes, filter exported docs, or enforce access. Enforce access in the product itself.

## Token budget

- The budget is approximate: about 4 characters per token.
- Sections are added in priority order: non-blocking constraints, then alternatives and warnings, then capabilities used, then failure handling. At the first section that does not fit, that section and all lower-priority sections are dropped. The plan ends with `_Omitted for budget: ..._`, which lists the dropped sections.
- The goal heading, the recommended plan, and blocking constraints are always kept, even if they exceed the budget.
- The `resolve_goal` and `resolve_procedure` tools accept `token_budget` from 200 to 8000 (default 2000). `simp-resolve --budget` accepts any integer of at least 1.

## Tool results on unhealthy KBs

The KB tools still answer when the KB has lint errors. Each successful result then starts with `[KB has N lint error(s); results may be incomplete]`.

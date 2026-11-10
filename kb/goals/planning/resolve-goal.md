---
type: goal
title: Turn a goal into an actionable plan
summary: Resolve a goal into ordered checks, steps, choices, and constraints, using what is already known about the user.
aliases:
  - lập kế hoạch từng bước
  - giải quyết mục tiêu
  - resolve a goal
  - get a step-by-step plan
  - what do I need to do
when_to_use:
  - Người dùng đã có mã mục tiêu và muốn biết các bước cần làm.
  - Agent wants an ordered plan with prerequisites before answering a user.
  - User wants to see how known states or a chosen option change the plan.
procedures:
  - procedure.planning.resolve-cli
  - procedure.planning.resolve-tools
---

The user or agent has a goal ID and wants the full plan: what to check first, what to run when a check fails, which decisions to make, and which rules apply.

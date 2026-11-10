---
type: goal
title: Understand and adjust knowledge-base relationships
summary: Explore how nodes connect in the graph, change relationships, and check the plan an agent would get.
aliases:
  - xem đồ thị tri thức
  - nối các nút với nhau
  - mục tiêu phụ thuộc vào quy trình nào
  - view the knowledge graph
  - link nodes together
  - preview the agent plan
when_to_use:
  - User wants to understand which procedures and states a goal depends on.
  - User wants to add or remove a precondition, requirement, or constraint link without editing YAML.
  - User wants to see what plan an agent receives for a goal.
procedures:
  - procedure.ui.inspect-relationships
sources:
  - packages/ui/src/workspace/service.ts
  - packages/ui/src/components/kb-graph.tsx
  - packages/ui/src/components/inspector.tsx
---

The user wants to see and change the structure of the KB: which nodes depend on which, and how that shapes the resolved plan.

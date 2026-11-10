---
type: capability
title: Resolve prerequisites, choices, and availability
summary: Expands a goal or procedure into an ordered plan of CHECK, RUN, and CHOOSE steps, with constraints and ranked alternatives.
aliases:
  - lập kế hoạch từ mục tiêu
  - plan resolution
constrained_by:
  - constraint.authoring.graph-rules
  - constraint.planning.availability-context
---

Resolution turns each of a goal's procedures into a full plan:

- **RUN** steps run required procedures first, then the procedure itself with its own steps.
- **CHECK** steps verify each precondition whose value is unknown. Each check includes the state's `check` text and, under `If false:`, the procedure to run.
- Preconditions reported as true are skipped and listed as `Already satisfied`. Preconditions reported as false add the fix procedure unconditionally.
- **CHOOSE** steps show each option's question, its `when` text, and a sub-plan for every option. A pre-selected option keeps only that branch.
- Optional preconditions are shown as advice and never add steps.
- Local images in a procedure's `## Steps` items, and in a state's body, are taken out of the step text and attached to the step or check. The Markdown plan shows each image's alt text as a `Screen:` line (`Màn hình:` in Vietnamese) under its step, never the image; JSON plans list them under `images` with `src`, `alt`, and, for procedures, `step`.
- Constraints from the procedures and the capabilities they use are collected and listed with their severity.

Alternatives are ranked by availability, then non-deprecated first, then the least preparation, the fewest steps, and declaration order. Nesting is limited to 8 levels by default. The plan is rendered as Markdown, or returned as JSON from `simp-resolve --format json`.

---
type: goal
title: Create or edit KB content visually
summary: Add new nodes or change existing node files from the browser, with validation after every save.
aliases:
  - thêm nút mới
  - chỉnh sửa nút trong giao diện
  - add a node in the browser
  - edit node markdown
when_to_use:
  - User wants to add a new goal, procedure, or state without creating the file by hand.
  - User wants to change a node's title, fields, or steps and see validation right away.
procedures:
  - procedure.ui.maintain-nodes
sources:
  - packages/ui/src/workspace/service.ts
  - packages/ui/src/components/node-dialog.tsx
  - packages/ui/src/routes/nodes/$id.tsx
---

The user wants to create or change KB content in the local UI instead of a text editor. Removing a node is a separate goal.

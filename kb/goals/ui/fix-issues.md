---
type: goal
title: Diagnose and repair KB issues in the browser
summary: Review lint errors and warnings in the local UI, open each affected file, and fix it until the KB is clean.
aliases:
  - sửa lỗi trong giao diện
  - xem danh sách vấn đề
  - fix errors in the UI
  - review lint issues visually
when_to_use:
  - Người dùng thấy số lỗi trên thanh tiêu đề của giao diện và muốn sửa.
  - User edited files outside the UI and wants to see the updated findings.
procedures:
  - procedure.ui.repair-issues
sources:
  - packages/ui/web/src/workspace/service.ts
  - packages/ui/web/src/routes/issues.tsx
  - packages/ui/web/src/routes/nodes/$id.tsx
---

The user wants to fix validation findings without leaving the browser, including files changed by other tools.

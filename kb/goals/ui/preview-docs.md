---
type: goal
title: Preview documentation before exporting it
summary: See how the KB will look as reader-facing docs, in site or graph layout, before running an export.
aliases:
  - xem trước trang tài liệu
  - kiểm tra tài liệu trước khi xuất
  - preview the docs site
  - check docs before export
when_to_use:
  - Người dùng muốn xem tài liệu sẽ hiển thị thế nào trước khi xuất bản.
  - User wants to check where a node's page appears after changing docs.path or docs.order.
procedures:
  - procedure.ui.preview-docs
sources:
  - packages/ui/src/routes/docs/$.tsx
  - packages/ui/src/workspace/service.ts
---

The user wants to review the generated docs in the browser. Download the current page as Markdown or the selected layout's full set as a ZIP from Docs.

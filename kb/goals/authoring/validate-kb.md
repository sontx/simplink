---
type: goal
title: Find and fix knowledge-base validation issues
summary: Check a KB for schema and graph errors, understand each finding, and fix the files until no errors remain.
aliases:
  - sửa lỗi lint
  - kiểm tra lỗi knowledge base
  - lỗi E007
  - fix lint errors
  - validate my KB
  - KB has errors
when_to_use:
  - Người dùng thấy thông báo "KB has lint error(s)" và muốn sửa.
  - User wants to check that their KB files are valid before publishing or serving them.
  - User wants a CI build to fail when the KB is invalid.
procedures:
  - procedure.authoring.lint-kb
  - procedure.ui.repair-issues
sources:
  - packages/core/src/cli/lint.ts
  - packages/core/src/lint-graph.ts
---

The user wants to know what is wrong with their KB and how to fix it. Search, resolution, and documentation export do not accept a KB that has errors.

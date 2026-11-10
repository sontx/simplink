---
type: goal
title: Customize knowledge-base behavior in an application
summary: Replace or extend validation, lint rules, search, availability and ranking, rendering, or the tool set in code.
aliases:
  - tùy biến hành vi KB
  - mở rộng simplink
  - quy tắc lint tùy chỉnh
  - thay đổi cách tìm kiếm
  - custom lint rule
  - custom search engine
  - add a custom tool
  - customize availability
when_to_use:
  - Developer wants to add their own lint rules or change how search works.
  - Developer wants plans to use their own entitlement data or ranking.
  - Developer wants to add, override, or remove KB tools exposed to a model.
procedures:
  - procedure.integration.configure-extensions
sources:
  - packages/core/README.md
  - packages/core/src/kb.ts
---

The user is a developer who wants Simplink's default behavior changed in their application. All extension points are configured in code when the KB is created.

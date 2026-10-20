---
type: goal
title: Check the KB automatically in CI or tests
summary: Make builds or tests fail when KB changes introduce errors, too many warnings, or broken plans.
aliases:
  - kiểm tra KB tự động
  - chặn lỗi KB trong CI
  - check the KB in CI
  - KB validation in a pipeline
  - test the KB in my test suite
when_to_use:
  - Người dùng muốn pipeline CI báo lỗi khi ai đó sửa KB sai.
  - User wants a CI build to fail when the KB is invalid.
  - Developer wants unit tests that lint the KB or check a plan without spawning a process.
procedures:
  - procedure.authoring.lint-in-ci
  - procedure.integration.run-cli-runners
sources:
  - packages/core/src/cli/lint.ts
  - packages/core/README.md
---

The user wants KB quality checked on every change, not only when someone remembers to run the linter.

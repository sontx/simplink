---
type: goal
title: Add screenshots to KB guides
summary: Attach screenshots to procedure steps and states so exported guides show each screen and agents get its description in plans.
aliases:
  - thêm ảnh chụp màn hình vào KB
  - thêm hình ảnh vào hướng dẫn
  - minh họa các bước bằng ảnh
  - add screenshots to the KB
  - add images to guides
  - illustrate steps with pictures
when_to_use:
  - Người dùng muốn tài liệu xuất ra có ảnh màn hình cho từng bước.
  - User wants readers to see which screen and control a step refers to.
  - User sees lint warning W110 or W111 about an image and wants to know how images work.
procedures:
  - procedure.authoring.add-images
sources:
  - packages/core/src/assets.ts
  - packages/core/README.md
---

The user wants pictures in their guides. Images are plain Markdown in node bodies: people see them in exported docs and the UI, while agents read only their alt text in plans.

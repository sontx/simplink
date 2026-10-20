---
type: goal
title: Open a local or Git-backed KB in the browser
summary: Start the local UI against a KB folder or a Git repository, so you can browse and edit it in a browser.
aliases:
  - mở KB trên trình duyệt
  - khởi động giao diện quản lý
  - open the KB manager
  - start the UI
  - edit a git repo KB in the browser
when_to_use:
  - Người dùng muốn xem và chỉnh sửa knowledge base bằng giao diện thay vì trình soạn thảo văn bản.
  - User wants to open a KB stored in a Git repository without cloning it by hand.
procedures:
  - procedure.ui.launch-workspace
sources:
  - README.md
  - packages/ui/src/bin.ts
  - packages/ui/src/server.ts
---

The user wants a visual workspace for a KB on their own machine, from a local folder or a Git URL.

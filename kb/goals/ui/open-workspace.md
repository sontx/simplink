---
type: goal
title: Open a KB folder in the browser
summary: Choose a local KB folder in the browser to browse and edit it, with direct writes in Chromium or memory and zip downloads elsewhere, or connect to a simp node to browse it read-only.
aliases:
  - mở KB trên trình duyệt
  - khởi động giao diện quản lý
  - open the KB manager
  - start the UI
  - open a local folder in the browser
when_to_use:
  - Người dùng muốn xem và chỉnh sửa knowledge base bằng giao diện thay vì trình soạn thảo văn bản.
  - User wants to browse and edit a locally cloned KB using a browser.
procedures:
  - procedure.ui.launch-workspace
  - procedure.ui.connect-simp-node
sources:
  - README.md
  - packages/ui/src/workspace/context.tsx
  - packages/ui/src/workspace/service.ts
---

The user wants a visual workspace for a KB on their own machine, from a local folder. Clone Git repositories yourself before opening their folders. To browse a product served by a running simp node, connect to the node instead.

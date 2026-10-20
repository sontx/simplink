---
type: goal
title: Load a knowledge base from a Git repository
summary: Load KB documents from a Git branch or tag, either from a fresh temporary clone or from a persistent local checkout.
aliases:
  - tải KB từ Git
  - KB lưu trên GitHub
  - load KB from git
  - knowledge base in a repository
when_to_use:
  - Người dùng lưu knowledge base trong một kho Git và muốn ứng dụng đọc trực tiếp từ đó.
  - Developer wants to load a specific branch, tag, or subfolder of a repository as the KB.
procedures:
  - procedure.integration.load-git-kb
sources:
  - packages/core/README.md
  - packages/core/src/git-source.ts
---

The user keeps the KB in a Git repository and wants application code to load it without copying files by hand.

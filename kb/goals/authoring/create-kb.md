---
type: goal
title: Create a knowledge base that agents can use
summary: Write a set of linked Markdown nodes that agents can search and resolve into step-by-step plans.
aliases:
  - tạo knowledge base
  - xây dựng cơ sở tri thức
  - viết tài liệu cho AI agent
  - bắt đầu KB mới cho sản phẩm của tôi
  - create a knowledge base
  - start a new KB
  - author product guidance
when_to_use:
  - User wants to start a new knowledge base for their product.
  - User wants to describe what their product can do so that an AI agent can guide users.
  - User has no KB yet and asks how to organize the files.
procedures:
  - procedure.authoring.create-kb
  - procedure.ui.maintain-nodes
sources:
  - packages/core/src/loader.ts
  - packages/core/schemas/goal.schema.json
  - README.md
---

The user wants a new Simplink knowledge base. It is a set of Markdown files that describe user goals, the procedures that achieve them, and the states, capabilities, and constraints those procedures depend on. To have a coding agent write the files, see [[goal.authoring.use-agent-skills]].

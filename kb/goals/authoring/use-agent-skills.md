---
type: goal
title: Let a coding agent build and use a knowledge base
summary: Give a coding agent the Simplink skills so it can write a KB from code or docs, keep it in sync, and use the Simplink tools.
aliases:
  - để AI agent tự viết knowledge base
  - cài skill Simplink cho Claude Code
  - nhờ agent tạo KB từ mã nguồn
  - let an agent build my KB
  - Simplink skills for Claude Code or Codex
  - generate a KB from my codebase
when_to_use:
  - User wants Claude Code, Codex, or another agent to create or update the KB from source code or docs.
  - User wants a coding agent to write the KB instead of writing every node by hand.
  - User asks what the Skills page is or how to install the skills bundle.
procedures:
  - procedure.ui.install-skills
---

The user wants an agent to do the authoring. Simplink ships agent skills that teach a coding agent how to build, update, and use a KB; the agent's output still goes through `simp-lint` and can be reviewed in the UI.

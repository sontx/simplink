---
type: goal
title: Find guidance for a user intent
summary: Search the KB with a user's own words to find the goal, procedure, or rule that answers their request.
aliases:
  - tìm hướng dẫn trong KB
  - tra cứu knowledge base
  - tìm mục tiêu phù hợp với yêu cầu
  - search the knowledge base
  - find the right goal
  - look up how to do something
when_to_use:
  - User or agent wants to find which KB goal matches a request.
  - User wants to check whether the KB covers a topic before writing new nodes.
procedures:
  - procedure.planning.search-cli
  - procedure.planning.search-tools
sources:
  - packages/core/src/cli/search.ts
  - packages/core/src/tools/core.ts
---

The user or agent has a request in natural language and wants the KB entry points that answer it. The search can run from the command line or through the KB tools.

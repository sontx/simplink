---
type: state
title: Knowledge-base Markdown documents exist
summary: The KB directory contains Markdown node files under the five type folders.
check: Run `simp-lint <dir>` and confirm that the final line reports more than 0 nodes.
satisfied_by:
  - procedure.authoring.create-kb
---

True when at least one `.md` file is under `goals/`, `procedures/`, `capabilities/`, `states/`, or `constraints/` in the KB directory. Search and plans also need at least one goal and its procedures.

---
type: state
title: Knowledge base has no lint errors
summary: Validation reports zero errors for the KB; warnings may remain.
check: Run `simp-lint <dir>` and confirm that the final line reports `0 error(s)`.
satisfied_by:
  - procedure.authoring.lint-kb
---

Until this is true, `simp-search`, `simp-resolve`, and `simp-docs` exit with code 2 and print `KB has N lint error(s); run simp-lint <dir> first.`

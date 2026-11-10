---
type: procedure
title: Reference another product's guidance
summary: Use declared simp names in typed frontmatter references and canonical simp links, then validate local structure and optionally check remote nodes online.
aliases: [tham chiếu sản phẩm khác, qualified product references]
requires: [procedure.federation.write-simp-doc]
uses: [capability.federation.peer-api]
constrained_by:
  [constraint.authoring.graph-rules, constraint.federation.mesh-limits]
---

## Steps

1. Declare the target simp name in the local `simp.md` peer list, such as `crm`.
2. In frontmatter, prefix the original node ID with the simp name. For example, use `preconditions: [crm:state.customers-imported]` or `procedures: [crm:procedure.import-customers]`. Keep the required target type.
3. In prose, write `[Import customers](simp://crm/goal.import-customers)`, optionally with `#heading`. Use `simp://crm` for that product's homepage and `simp:///goal.local` for local guidance. Wikilinks such as `[[crm:goal.import-customers]]` remain supported.
4. Run `simp-lint <kb>`. E016 means the simp prefix was not declared; E008 means the ID has the wrong type or format. References using this simp's own name normalize to local IDs.
5. When peer endpoints are available, run `simp-node lint --peers <kb>` to check remote existence and types. Treat W109 as an unreachable peer rather than proof that a remote node is missing.
6. Use qualified IDs returned by search directly in subsequent tool calls. Review remote availability warnings before executing the resulting plan.

---
target: packages/ui/src
total_score: 28
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:/home/sontx/simplink/packages/ui/src"
timestamp: 2026-11-04T10-46-54Z
slug: packages-ui-src
---

Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                 |
| --------- | ------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 3         | Folder/remote mode only in 9px rail footer, hidden on phones; delete gives no feedback    |
| 2         | Match System / Real World       | 3         | Raw js-yaml text in save dialog; tool IDs as chips                                        |
| 3         | User Control and Freedom        | 3         | Delete file has no undo; empty-filter state has no reset; add+remove leaves `related: []` |
| 4         | Consistency and Standards       | 3         | "Save anyway" styled primary; pink used decoratively (Playground note, Nodes count pill)  |
| 5         | Error Prevention                | 3         | Strong guards; delete irreversible; risky choice is primary                               |
| 6         | Recognition Rather Than Recall  | 3         | Graph card titles cut ~28 chars; IDs cut in inspector                                     |
| 7         | Flexibility and Efficiency      | 2         | Ctrl K nodes-only; no bulk actions; keyboard node selection broken                        |
| 8         | Aesthetic and Minimalist Design | 3         | Depth-2 canvas tangle; edge labels collide; all edges same weight                         |
| 9         | Error Recovery                  | 2         | Wrong node path shows bare "HTTP 404"; one deleted node = 6 unrelated-looking E007 rows   |
| 10        | Help and Documentation          | 3         | Glossaries good; depth/areas not explained in context                                     |
| **Total** |                                 | **28/40** | **Good**                                                                                  |

## Design Specificity Verdict

LLM: mostly authored — start-node reasons, Graph health block, area cards with type-dot counts, live plan/docs beside source, three-state memory banner, lint-code issue rows. Generic: Nodes table, Playground three-column layout, Skills cards, open-screen e-commerce sample questions.
Deterministic: CLI 1 — side-tab index.css:409 (documented blockquote rule; false positive). index.html clean. Browser: / 1 dark-glow (simp-network.tsx:266 receive ring; borderline vs "no glowing accents"); /graph 16–21 (side-tab node cards documented; tiny-text 11px Meta documented; undersized-ui-text 9px REMOTE eyebrow documented; text-occlusion: React Flow hit paths false positive, minimap covering node titles real); Whole map 4 (all documented meta/eyebrow); /nodes /playground /issues /docs 1 each (REMOTE eyebrow). No console errors/warnings.

## Priority Issues

1. [P1] Focused graph canvas hard to read: titles truncated, fit zoom below 12px, edge labels collide, no emphasis on selected node's edges. Fix: 2-line titles, min fit zoom, labels only on hover/selected/adjacent edges, dim non-adjacent edges. /impeccable layout then /impeccable polish
2. [P1] Graph keyboard path broken: Enter on a node doesn't open inspector (only onNodeClick, kb-graph.tsx:552); Tab walks every edge first; nodes role=group unnamed. Fix: select via selection change/Enter, edgesFocusable={false}, aria-label "Goal: <title>". /impeccable audit then /impeccable harden
3. [P1/P2] Delete file irreversible and silent; dangling refs appear as N separate issue rows. Fix: status toast with Undo; group issues by missing target with Restore/Remove references. /impeccable harden
4. [P2] Storage mode invisible outside memory mode; read-only editor looks editable. Fix: header mode chip at all widths; read-only note above editor. /impeccable clarify
5. [P2] Errors and risky choices: bare "HTTP 404" for wrong node path; raw YAML text; "Save anyway" primary. Fix: plain messages with recovery; Cancel/Keep editing primary, Save anyway outline. /impeccable clarify

## Persona Red Flags

Alex: Ctrl K nodes-only, no commands, always opens Graph; no canvas keyboard selection or next-issue key; no bulk select.
Sam: Tab marches every edge; Enter on node does nothing useful; 11px meta dominates Graph; delete not announced.
KB author beside editor + simp-lint: add-then-remove leaves `related: []` (git noise, "1 file changed"); issues by file not cause; folder vs remote near-invisible.

## Minor Observations

Monaco scrollbar over sticky footer; editor loses YAML colours after live theme switch; empty-filter Graph has no Reset; Find answers confident match for gibberish; plan heading "( • id )"; vi: inspector footer wraps, "Thử nghiệm" wraps, "lint" untranslated; phone inspector overlay has no close button; Nodes titles cut while ID column has space; Constraint and Goal share Goal Rose; dark open-screen bubble labels near invisible; open-screen receive-ring glow.

## Questions to Consider

- Why is the default Graph a free-form tangle rather than lanes in plan order (goal → procedure → capability)?
- Should Issues group by cause ("I deleted X") rather than by file?
- Does Playground earn its own route when authors check output beside the source?

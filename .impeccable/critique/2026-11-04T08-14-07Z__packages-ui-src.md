---
target: packages/ui/src
total_score: 27
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/home/sontx/simplink/packages/ui/src"
timestamp: 2026-11-04T08-14-07Z
slug: packages-ui-src
---

Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                |
| --------- | ------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 3         | Dirty state is muted text only, not announced; relationship edits save silently          |
| 2         | Match System / Real World       | 3         | In/Out columns, depth 1/2/3/All, raw tool chips, "Availability: available"               |
| 3         | User Control and Freedom        | 2         | No undo; one-click relationship removal writes the file; no Clear filters                |
| 4         | Consistency and Standards       | 2         | New node: dropdown vs split button; ⌘K → Graph vs row → node page; Playground not in URL |
| 5         | Error Prevention                | 3         | Strong guards; Delete file next to Save file; relationship removal unguarded             |
| 6         | Recognition Rather Than Recall  | 3         | Relationship targets shown as raw IDs only                                               |
| 7         | Flexibility and Efficiency      | 2         | ⌘K nodes-only, no Next-issue shortcut, no bulk actions                                   |
| 8         | Aesthetic and Minimalist Design | 3         | Fit-all graph + minimap noise; persistent memory banner; repeated Docs folders           |
| 9         | Error Recovery                  | 3         | CORS error names exact flag; parse-break message precise                                 |
| 10        | Help and Documentation          | 3         | Glossaries good; no shortcut sheet; no Docs → source node link                           |
| **Total** |                                 | **27/40** | **Acceptable**                                                                           |

## Design Specificity Verdict

LLM: mostly specific, but concentrated. Tokens, type badges, simp-network open screen, lint-mirroring copy, and the save → "Cleared N issues" loop are authored. Nodes, Issues, Playground are stock shadcn compositions. The signature graph card is illegible at the default fit-all zoom.
Deterministic: 2 CLI findings in packages/ui/src — design-system-font-size index.css:352 (16px on .markdown-compact h2, off-ramp; real); side-tab index.css:391 (blockquote left rule; false positive). index.html clean. Browser: 2 tiny-text on /graph (graph.tsx:115, graph.tsx:232) — matches DESIGN.md 11px Meta role; borderline false positive. /, /nodes, /issues, /docs, /playground clean. Console: TanStack "sortFn 'text' not registered" for column id on /nodes.

## Priority Issues

1. [P1] Graph opens as an unreadable fit-all map (kb-graph.tsx:355-361, fitView, minZoom 0.15). Fix: open on a meaningful focus (first issue → orphan → last edited → top goal) at depth 2 with readable min zoom; fit-all as explicit control; hide minimap at fit-all. /impeccable layout
2. [P1] One-click relationship removal writes to disk with no undo (inspector.tsx:253-266). Fix: undo toast, show target titles with ID secondary, announce change. /impeccable harden
3. [P2] Editor dirty state weak; preview gated on save; Delete beside Save (nodes/$id.tsx:503-510, 644, 651-667). Fix: dirty dot on Source tab/Save/rail, role=status, debounced live draft preview, move Delete to overflow, "Save and leave" in guard. /impeccable polish
4. [P2] Pink everywhere dilutes the One Pen Rule (index.css:94-104; nodes/index.tsx:127-134). Fix: IDs in muted mono, title is the link, pink on hover/focus only. /impeccable quieter
5. [P2] Cross-route pattern drift (graph.tsx:120-145 vs nodes/index.tsx:233-264; __root.tsx:406-411). Fix: one New-node component; ⌘K opens node page with "Show in graph" secondary; Playground state in URL. /impeccable distill

## Persona Red Flags

Alex: ⌘K has no actions and lands on Graph; no Next-issue/tab shortcuts; no bulk retag/deprecate; Playground not bookmarkable.
Sam: rows navigate via tr onClick with two links each; no aria-sort anywhere; dirty state not announced; 24px × targets; 9px mobile rail labels; ~4px graph text.
KB author beside editor + simp-lint: external file edits need manual icon-only Reload with no staleness hint; Docs page has no link back to source node; memory banner repeats on every route.

## Minor Observations

React Flow attribution on every canvas; bare "en" language button; vi: "docs" folder translated while siblings stay English, "Thử nghiệm" wraps; Skills example questions not passed through t(); plan heading "( `id` )" spacing and redundant "Availability: available"; Playground safety note floats detached; Nodes empty state lacks Clear filters; sticky save bar overlaps editor scrollbar; header+banner ≈155px of 844 on phone; rail MEMORY label 11px vs DESIGN.md 9px eyebrow; markdown-compact h2 at 16px; open-screen example questions are e-commerce, not KB authoring.

## Questions to Consider

- Why does the source of truth open as a map nobody can read, instead of where attention belongs?
- Should Graph and Nodes be one surface with a list/canvas toggle sharing filters and selection?
- If output sits next to source, why is the preview gated on save — and should Playground be a panel on every goal/procedure?

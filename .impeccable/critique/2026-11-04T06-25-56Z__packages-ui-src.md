---
target: Simplink UI (packages/ui/src)
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 2
target_identity: "file:/home/sontx/simplink/packages/ui/src"
timestamp: 2026-11-04T06-25-56Z
slug: packages-ui-src
closed: true
---

Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score — 26/40 (Acceptable)

| #   | Heuristic                       | Score | Key Issue                                                                                                |
| --- | ------------------------------- | ----- | -------------------------------------------------------------------------------------------------------- |
| 1   | Visibility of System Status     | 3     | Storage mode always visible; Playground result renders ~820px below fold with no scroll/focus            |
| 2   | Match System / Real World       | 3     | "Loading node…" while editor loads; "Depth all" aria-label; "1 errors"                                   |
| 3   | User Control and Freedom        | 3     | Unsaved guard lacks "Save and leave"; saving broken YAML silently drops node from graph                  |
| 4   | Consistency and Standards       | 3     | Hard-coded ⌘K on Linux; backdrop-blur on dialog/sheet vs DESIGN.md "no glass"; plan H1 32px > page title |
| 5   | Error Prevention                | 2     | No pre-save YAML check; delete dialog counts dangling refs without naming them                           |
| 6   | Recognition Rather Than Recall  | 3     | Node creation on graph is right-click only                                                               |
| 7   | Flexibility and Efficiency      | 2     | ⌘K = nodes only; plan node IDs aren't links                                                              |
| 8   | Aesthetic and Minimalist Design | 3     | Graph filter panel: 14 pink checkboxes at rest; ~30 "Overview" links in Docs sidebar                     |
| 9   | Error Recovery                  | 1     | Unparsed files told to "fix in your editor" though editable in Source; "Node not found" dead end         |
| 10  | Help and Documentation          | 3     | Good glossaries and disclosures                                                                          |

## Detector

CLI: 1 finding (side-tab, index.css:356 blockquote) — false positive per DESIGN.md.
Overlay: landing 0; nodes 2; issues 2; playground 3; docs 4; skills 6; node detail 26; graph 53.
Real: active nav/tab pink #db2777 on #fce7f3 3.9:1; inactive tab #837a85 on #fff1f5 3.8:1; 9px MEMORY footer (__root.tsx:347); skipped headings (graph.tsx h1→h3, node detail h1→h4); line-length/stragglers on Skills; nested card in playground.tsx:98.
Intentional/vendor: side-tab on graph cards (DESIGN.md:351); React Flow attribution.

## Priority Issues

1. [P1] Unparsed files dead-end in Issues (issues.tsx:29-35); not in issueQueue. Fix: path-keyed source editor route + include in queue. → harden
2. [P1] Playground output off-screen, no focus move or live region. Fix: scroll+focus result, side-by-side at ≥1100px, link node IDs, cap plan H1. → layout
3. [P2] Active-state contrast 3.8–4.4:1 on nav, tabs, docs sidebar, depth toggle; 9px rail footer. Fix: darker pink ink for active text on blush (≥4.5:1); 11px floor. → audit / polish
4. [P2] Graph explorer overloaded: 20 controls at rest, ungrouped relationships, orphans below fold, 71-node fit-view with empty inspector. Fix: group relationships into 3, plum checks, orphans as top problem count, inspector shows KB health. → distill
5. [P2] Source and output are separate tabs on node page; Save/Delete below fold. Fix: split Source | Preview on wide screens, sticky actions. → layout

## Personas

Alex: ⌘K nodes only; no plan→node links; no cross-file issue stepping; right-click create.
Sam: right-click-only create; silent Playground result; "1 errors"; 3.8–3.9:1 active states; skipped headings.
KB author: typo → told to leave browser; node silently vanishes after broken save; Issues lacks simp-lint style "N nodes · 0 errors" summary.

## Minor

Open screen lacks theme/lang toggle; English bubbles in vi; connect field placeholder-only; connect error not localised (store.ts:219); Nodes table mobile IDs-first; Monaco stock token colours; duplicate "Not sure" option; broken-file issue rows lack type badge; "All clear" end state muted.

## Questions

- Why does the app land on Graph rather than on what's broken?
- Should the node page be the Playground: source left, resolved plan/docs right?
- Is a whole-KB fit the right graph view, or should the graph be a lens entered from a node or issue?

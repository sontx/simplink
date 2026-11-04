---
target: packages/ui/src
total_score: 29
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 1
target_identity: "file:/home/sontx/simplink/packages/ui/src"
timestamp: 2026-11-04T09-21-30Z
slug: packages-ui-src
---

Method: dual-agent (A: design review · B: detector + browser overlay)

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                           |
| --------- | ------------------------------- | --------- | --------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 3         | Memory banner says the same thing before edits, after edits, after download                         |
| 2         | Match System / Real World       | 3         | Playground says "item" not "node"; raw YAML parser text in confirm                                  |
| 3         | User Control and Freedom        | 3         | Undo + 3-way leave guard; Delete file has no undo even in memory mode                               |
| 4         | Consistency and Standards       | 3         | Graph empty-filter state has no reset (Nodes does); Skills centred 16px layout; "Find Node…" casing |
| 5         | Error Prevention                | 3         | Relationship picker offers the node itself as a target                                              |
| 6         | Recognition Rather Than Recall  | 3         | Docs sidebar repeats 7 area labels x3; graph cards truncate titles                                  |
| 7         | Flexibility and Efficiency      | 2         | Ctrl K nodes-only and always lands on Graph; no bulk actions                                        |
| 8         | Aesthetic and Minimalist Design | 3         | Permanent memory stripe; edge-label collisions; Whole map hairball                                  |
| 9         | Error Recovery                  | 3         | Strong codes + deep links; raw YAML; stale "Cannot reach" alert beside native bubble                |
| 10        | Help and Documentation          | 3         | Glossaries good; issue codes don't link to explanations                                             |
| **Total** |                                 | **29/40** | **Good**                                                                                            |

## Design Specificity Verdict

LLM: mostly authored. Graph card, start-node strip with reason, simp-lint-echo copy, export-refusal banner, live Docs/plan preview are product-specific. Nodes table, Playground cards, Skills, open-screen support-bot questions, and Whole map are generic.
Deterministic: CLI 1 finding — side-tab index.css:403 (blockquote rule, documented in DESIGN.md; false positive). index.html clean. Browser /graph 15: side-tab x5 on graph node cards (documented signature; false positive), tiny-text x4 (graph.tsx:177, :294, focus chip :126 — documented 11px Meta; chip title borderline), text-occlusion x6 (3 React Flow hit-area paths = false positive; 3 minimap covering a node/edge label = real, low). /nodes /playground /issues /docs clean. No console errors or warnings (previous TanStack sortFn warning gone).

## Priority Issues

1. [P1] Memory banner never reflects whether work is at risk (__root.tsx:279). Fix: state from store.dirty — quiet before edits, "N files changed since download" after, success after download; move dot-file caveat; collapse on phone. /impeccable harden then /impeccable clarify
2. [P2] Relationship picker allows a self-relationship (inspector.tsx:247-249 filters targets only). Fix: exclude node.id; guard cycle-forming kinds. /impeccable harden
3. [P2] Whole map unreadable; default canvas edge-label collisions; minimap covers nodes. Fix: semantic overview (cluster by area/type with counts and issue bubbles), hide edge labels below a zoom threshold, collapsible minimap. /impeccable distill then /impeccable layout
4. [P2] Graph empty-filter dead end: blank canvas, empty minimap, inspector still shows hidden node, strip still says "Most connected goal". Fix: Reset filters button, hide minimap when empty, mark inspector node hidden. /impeccable harden
5. [P3] Terminology and translation: Playground "item" → "node"; t("Yes")/t("No") missing vi (playground.tsx:525-526); wrap raw YAML errors. /impeccable clarify

## Persona Red Flags

Alex: Ctrl K has no actions and always opens Graph; no bulk select; one popover per relationship kind; split button always "Add goal".
Sam: edge labels ~6-7px at default zoom; 9px mobile rail labels; open screen can announce two errors; canvas offers little to traverse by keyboard.
KB author beside editor + simp-lint: external disk edits need manual Reload with no conflict warning under an unsaved draft; memory mode has no changed-since-download count; Source tab scrolls the node title away.

## Minor Observations

Theme ignores prefers-color-scheme; rail MEMORY 11px vs 9px eyebrow; quote titles in relationship notice; plan heading "( • id )" spacing; disabled pink primary reads washed-out; Nodes empty state shows 0–0 pager and column jump; no pending indicator on slow route change; vi wraps "Tài liệu" and "Thử nghiệm"; modal overlay bg-black/10 is untinted grey; Issues severity select shown with zero issues; open-screen sample questions are support-bot, not KB authoring.

## Questions to Consider

- Would a matrix (areas × types, issue counts per cell) say more about KB health than a zoomed-out node-link diagram?
- Should memory mode be a state an author finishes ("all changes downloaded") rather than a permanent stripe?
- What job does Playground do that justifies a top-level route, rather than folding "Find answers" into Ctrl K?

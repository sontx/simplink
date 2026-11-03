---
target: packages/ui
total_score: 22
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 3
target_identity: "file:E:\\personal\\simplink\\packages\\ui\\src"
timestamp: 2026-11-03T14-57-07Z
slug: packages-ui-src
---

Method: dual-agent (A: design review · B: detector). Browser inspection unavailable: Claude in Chrome extension not connected; source-only review, no overlay.

## Design Health Score

| #         | Heuristic                       | Score     | Key Issue                                                                                                                                         |
| --------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Visibility of System Status     | 2         | A remote, read-only simp node still says "LOCAL KB" (__root.tsx:295). Folder mode has no indicator. The stale-rebuild alert is an unstyled `<p>`. |
| 2         | Match System / Real World       | 3         | The terms are right. Raw E…/W… issue codes appear with no explanation. "Source ↗" uses an external-link arrow for an internal route.              |
| 3         | User Control and Freedom        | 2         | Filters live in the URL (good). Delete has no undo and no Cancel button. Guards use native `window.confirm`.                                      |
| 4         | Consistency and Standards       | 2         | Three different eyebrow styles, hex literals, ⌘K shown on Windows, and about 10 untranslated strings.                                             |
| 5         | Error Prevention                | 2         | The graph context menu offers "New simp here…" (kb-graph.tsx:425), which would write `undefined/…md`.                                             |
| 6         | Recognition Rather Than Recall  | 2         | Right-click node creation is only mentioned in an empty-state hint. The editor has line numbers off (nodes/$id.tsx:267).                          |
| 7         | Flexibility and Efficiency      | 2         | ⌘K and URL state are good. No Ctrl+S, no next-issue navigation. Search always jumps to /graph.                                                    |
| 8         | Aesthetic and Minimalist Design | 3         | Calm, tinted and flat. Let down by the Graph explorer's density and the Playground's box-in-box layout.                                           |
| 9         | Error Recovery                  | 2         | Raw `error.message` with no next step. "Fix on disk, then Reload" is a dead end inside the browser editor.                                        |
| 10        | Help and Documentation          | 2         | Help is `title=` tooltips only (invisible to keyboard and touch). There's no issue-code reference.                                                |
| **Total** |                                 | **22/40** | **Acceptable**                                                                                                                                    |

## Design Specificity Verdict

LLM: about 60% grounded. The graph node card, the `--type-*` token mechanism, the two-tone wordmark, the simp-network open screen and the problem count bubbles are Simplink's own. Nodes (a stock TanStack table), Playground (tool picker plus form card) and Skills (plain cards) could belong to any shadcn admin. Rule violations:

- **Tinted Paper:** minimap greys and violet (kb-graph.tsx:379); status-dot hexes (nodes/index.tsx:136); unused grey chart/sidebar tokens.
- **One Pen:** decorative pink icon tiles in Playground (398, 280); "Open editor" is primary on a read-only node.
- **Status:** Docs shows lint errors in ochre (docs/$.tsx:199).

Deterministic scan: 34 findings, about 9 of them false positives.

- **Font sizes (30).** Real drift falls in three patterns:
  - 10px meta text where the scale has 9 or 11px (inspector.tsx:127/153/224, kb-graph.tsx:84, graph.tsx:44/78/83)
  - 17–18px panel titles where the Title size is 20px (inspector.tsx:124, graph.tsx:80/216)
  - an undocumented 22px mobile h1 on five pages
- **Below-floor text:** 8px rail footer (__root.tsx:294) and a 13px Markdown body (markdown.tsx:76), which is under the 14px reading floor.
- **Radii (3):** 5px React Flow controls and 4px inline code.
- **Side tab (1):** the docs blockquote. It's a documented decision, so a false positive.

Visual overlays: none. Injection was never attempted because the browser was unavailable.

## Priority Issues

1. **[P1] The issue-fixing loop is broken across three screens.**
   - _Problem:_ Issues are grouped by code, not by file. The editor has no line numbers. Lint messages sit below Save/Delete and are not editor markers. There's no next issue.
   - _Fix:_ Group Issues by file with errors first. Turn line numbers on. Show lint issues as Monaco markers and move the list above the editor. Add "Next issue (n of N)" and Ctrl/⌘+S.
   - _Command:_ /impeccable layout and /impeccable harden.
2. **[P1] Storage and connection mode isn't always visible.**
   - _Problem:_ A remote node says "LOCAL KB" and nothing says read-only. "Open editor" stays primary.
   - _Fix:_ A mode chip: Folder / Memory / Remote · read-only. In read-only, use an outline "View source".
   - _Command:_ /impeccable clarify.
3. **[P1] Node-type badges fail contrast.**
   - _Problem:_ Ink on wash is about 2.7–3.1:1.
   - _Fix:_ Add `--type-text` at ≥4.5:1 (goal #9a4f63, procedure #3d6a96, capability #357a64, state #8a6224) and keep the soft ink for edges and dots. Check dark mode too.
   - _Command:_ /impeccable audit, then /impeccable colorize.
4. **[P2] High-stakes confirmations are native and untranslated.**
   - _Problem:_ `window.confirm` is used in context.tsx:170/187/215 and nodes/$id.tsx:83. The delete dialog has no Cancel.
   - _Fix:_ One translated ConfirmDialog with Cancel focused by default. In memory mode, add "Download .zip and leave". Translate the roughly 10 hard-coded strings.
   - _Command:_ /impeccable harden.
5. **[P2] "Tailor your plan" is unbounded, and the graph menu offers an invalid type.**
   - _Problem:_ The form lists every state and choice in the KB. The menu offers "New simp".
   - _Fix:_ Scope to the selected goal's reachable nodes, and filter `simp` out of the menu.
   - _Command:_ /impeccable distill.

## Persona Red Flags

**Alex (power user)**

- No Ctrl+S and no next-issue navigation.
- ⌘K can't open the editor directly.
- Edges can only be created by dragging.
- Graph defaults hide 2 of 5 types with no indicator.
- Page size isn't kept in the URL.

**Sam (accessibility, keyboard, screen reader)**

- Badge contrast fails AA.
- Chrome text at 8–10px.
- Help is tooltip-only.
- Table rows are clickable by mouse only.
- The rail bubble's aria-label sits on a span.
- No skip link.
- The theme toggle's icon and label disagree.
- Disabled buttons show `cursor: wait`.

**Kim (fixing 12 lint errors before a release)**

- She can't see "4 files to fix" at a glance.
- She lands in an editor without line numbers, with the message below the buttons.
- Nothing confirms the issue cleared, so it's 12 round trips to the Issues page.
- The ochre error warning in Docs understates errors.

## Minor Observations

- `ErrorMessage` has no radius, icon or red text.
- The "Opening folder…" bar is unstyled and untranslated.
- The orphan list is unbounded.
- At 780px, the explorer, rail and overlay inspector crush the canvas.
- Frontmatter object values render as raw JSON.
- Docs has two download styles on one screen.
- The open-screen subtitle ignores remote connections.
- `--popover-foreground` (#31262c) is a near-duplicate of plum-ink.
- The 26px open-screen wordmark isn't documented.
- shadcn's `sm` buttons use 0.8rem text.

## Questions to Consider

- If "problems first" is a principle, why does the app land on Graph instead of a health view ("12 errors in 4 files → fix first")?
- Is the Playground an authoring debugger or an end-user simulator? If it's for authors, should it show why the resolver picked each step?
- Would a glyph or shape per node type next to the colour make the map readable while the colours stay soft?

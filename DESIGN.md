---
name: Simplink
description: A quiet browser desk for mapping, fixing, and previewing Markdown knowledge graphs.
colors:
  simp-pink: "#db2777"
  simp-pink-ring: "#ec4899"
  blush-wash: "#fce7f3"
  petal-mist: "#fff1f5"
  deep-berry: "#9d174d"
  mulberry: "#831843"
  lavender-paper: "#faf9fc"
  card-white: "#ffffff"
  plum-ink: "#302b3b"
  dusty-mauve: "#75636c"
  lilac-hairline: "#e8e5ed"
  rose-input-edge: "#e7d6df"
  alarm-red: "#dc2626"
  amber-ochre: "#946200"
  goal-rose: "#c17889"
  goal-rose-wash: "#fbf0f3"
  procedure-blue: "#5e8dbb"
  procedure-blue-wash: "#edf3fa"
  capability-sage: "#5b9d88"
  capability-sage-wash: "#edf7f2"
  state-ochre: "#b88b4d"
  state-ochre-wash: "#fbf5e9"
  goal-rose-ink: "#975263"
  procedure-blue-ink: "#3d6b97"
  capability-sage-ink: "#317461"
  state-ochre-ink: "#8c6120"
  alarm-red-ink: "#b91c1c"
  amber-ochre-ink: "#8b5900"
  success-green: "#2f7d5b"
typography:
  wordmark:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "23px"
    fontWeight: 700
    letterSpacing: "-1px"
  headline:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "25px"
    fontWeight: 650
    letterSpacing: "-0.7px"
  title:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  eyebrow:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "9px"
    fontWeight: 650
    letterSpacing: "1.7px"
  meta:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "11px"
    fontWeight: 400
  mono:
    fontFamily: "Cascadia Code, Consolas, monospace"
    fontSize: "11px"
  docs-display:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  docs-heading:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "22px"
    fontWeight: 600
  docs-subheading:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  docs-body:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.75
  docs-code:
    fontFamily: "Cascadia Code, Consolas, monospace"
    fontSize: "13px"
    lineHeight: 1.6
  docs-display-mobile:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "26px"
    fontWeight: 600
  headline-mobile:
    fontFamily: "Geist Variable, sans-serif"
    fontSize: "22px"
    fontWeight: 650
rounded:
  sm: "6px"
  node: "7px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "26px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  page-x: "42px"
  page-y: "35px"
components:
  button-primary:
    backgroundColor: "{colors.simp-pink}"
    textColor: "{colors.card-white}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.blush-wash}"
    textColor: "{colors.mulberry}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.lavender-paper}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.petal-mist}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  badge-type-goal:
    backgroundColor: "{colors.goal-rose-wash}"
    textColor: "{colors.goal-rose-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
    height: "20px"
  nav-item-active:
    backgroundColor: "{colors.blush-wash}"
    textColor: "{colors.simp-pink}"
    rounded: "{rounded.node}"
    padding: "12px 4px"
  graph-node:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.plum-ink}"
    rounded: "{rounded.node}"
    padding: "13px 15px"
    width: "230px"
    height: "90px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.xl}"
    padding: "32px"
---

# Design System: Simplink

## Overview

**Creative North Star: "The Cartographer's Desk"**

Simplink is a drafting desk for mapping product knowledge. The desk is quiet: violet-tinted paper (`lavender-paper`), white card surfaces, plum ink, and hairline lilac borders. The map is where colour lives. Four muted node-type hues (rose, blue, sage, ochre) mark goals, procedures, capabilities and states across graph nodes, badges and type dots. One brand accent, **Simp Pink**, marks what the author is touching right now: the active view, the selected node, the primary action, a link.

Controls should feel **soft and approachable**: gently rounded, tinted rather than outlined in grey, and calm at the density needed for long editing sessions next to an editor and a terminal. Structure comes from tonal layers and hairlines, not shadows. Problems are the exception: error red and warning ochre may interrupt anywhere, because "problems first" is a product principle.

The system rejects four looks: generic grey shadcn (no tint, no type colour), neon dev-tool dark, marketing gloss (gradients, glass, hero type inside the app), and rainbow chrome (node-type colours leaking into navigation, buttons or page frame).

**Key Characteristics:**

- Violet-tinted neutrals everywhere. No pure greys in the light theme's foreground, border or background roles.
- One brand accent (Simp Pink) for selection, the active state and primary action.
- Four node-type colours, each with a wash, used only for knowledge-graph semantics.
- Flat at rest. Lift only appears on overlays, drawers and selection.
- Geist Variable throughout. Cascadia Code for source and IDs.
- Full light and dark themes; light is the default.

## Colors

The palette is a tinted-paper desk with one pink pen and four map inks.

### Primary

- **Simp Pink** (`simp-pink`): the brand accent. It's the "simp" half of the wordmark, the primary button, links, active nav item, selected graph node border, and the question pulse in the simp-network animation. In dark mode it lightens to #f472b6 with a deep #301021 foreground.
- **Simp Pink Ring** (`simp-pink-ring`): focus rings at 50% alpha, the selected-node halo at 12%, and the blockquote rule in rendered Markdown. It's the same in both themes.
- **Blush Wash** (`blush-wash`): secondary buttons, nav hover and active backgrounds, and accent surfaces. Dark: #392334.
- **Deep Berry** (`deep-berry`) and **Mulberry** (`mulberry`): text on blush surfaces and the link hover colour. Dark: #f9a8d4.

### Neutral

- **Lavender Paper** (`lavender-paper`): the page and canvas background, code-block and table-header fill. Dark: #17131d.
- **Card White** (`card-white`): header, nav rail, inspector, cards, graph nodes, popovers. Dark: #211b28 for cards and #282030 for popovers.
- **Plum Ink** (`plum-ink`): primary text. Dark: #f1eaf4.
- **Dusty Mauve** (`dusty-mauve`): secondary text, placeholders, the rail's storage-mode footer, inactive nav labels. Dark: #b8aabd.
- **Petal Mist** (`petal-mist`): muted fills such as ghost hover, tab-list background and blockquote fill. Dark: #2c2433.
- **Lilac Hairline** (`lilac-hairline`): every border and divider. Dark: white at 10%.
- **Rose Input Edge** (`rose-input-edge`): input borders, slightly warmer than structural hairlines. Dark: white at 15%.

### Status

- **Alarm Red** (`alarm-red`): lint errors, destructive actions, the error count bubble, and ghost (missing) nodes at a 10% wash. Dark: oklch(0.704 0.191 22.216).
- **Amber Ochre** (`amber-ochre`): warnings, the memory-mode banner (10% wash), and the warning count bubble. Dark: #e5b96c.
- **Alarm Red Ink** (`alarm-red-ink`) and **Amber Ochre Ink** (`amber-ochre-ink`): severity text on the 12% severity washes (error codes, warning bubbles), where the plain status colours fall under 4.5:1. Dark mode uses the status colours themselves.
- **Success Green** (`success-green`, `--success`): the "active" status dot. Dark: #7fcfa6. Deprecated uses Amber Ochre.
- **Answer Emerald** (Tailwind emerald-500): reserved for the "answer" packet in the simp-network animation on the open screen. Not used in the workspace.

### Node Types

Each type has an ink and a wash, set as `--type-color` / `--type-bg` by a type class (`.goal`, `.procedure`, `.capability`, `.state`, `.constraint`).

- **Goal Rose** (`goal-rose` on `goal-rose-wash`): goals and constraints. Dark: #e6a2b4 on #402734.
- **Procedure Blue** (`procedure-blue` on `procedure-blue-wash`). Dark: #95bde6 on #233347.
- **Capability Sage** (`capability-sage` on `capability-sage-wash`). Dark: #8dceb5 on #20392f.
- **State Ochre** (`state-ochre` on `state-ochre-wash`). Dark: #e5bd7d on #3b3021.

Each type also sets `--type-ink`, a deeper shade of the same hue for type-coloured **text**: Goal Rose Ink (`goal-rose-ink`), Procedure Blue Ink (`procedure-blue-ink`), Capability Sage Ink (`capability-sage-ink`) and State Ochre Ink (`state-ochre-ink`). Each is at least 5:1 on its wash, the card and the page. In dark mode the inks equal the type colours, which already clear 6.5:1.

### Named Rules

**The Readable Ink Rule.** Type-coloured text uses `--type-ink`, never `--type-color`. The lighter type colours are for edges, dots and minimap fills, where 3:1 is enough.

**The One Pen Rule.** Simp Pink means "this is active, selected or the next action." Never use it for decoration, section fills or illustration.

**The Map Ink Rule.** Node-type colours belong to knowledge-graph semantics only: badges, node left-edges, type dots and graph filters. They never colour navigation, buttons or page chrome.

**The Tinted Paper Rule.** Neutrals carry a violet cast. A new surface or text colour that reads as neutral grey is a bug.

## Typography

**Display Font:** Geist Variable (with sans-serif)
**Body Font:** Geist Variable (with sans-serif)
**Label/Mono Font:** Cascadia Code (with Consolas, monospace)

**Character:** One humanist-geometric family carries the whole desk. Hierarchy comes from fine-grained weights (550, 600, 650) and tight negative tracking at headline sizes, never from a second display face. Monospace marks machine truth: node IDs, frontmatter, source and code.

### Hierarchy

- **Wordmark** (700, 23px, -1px tracking; 20px under 780px): "simplink" in the header and above the open-screen card, with "simp" in Simp Pink. One size everywhere; the open screen gets its presence from space, not a bigger mark.
- **Headline** (650, 25px, -0.7px; 22px under 780px, set once on `h1` in `index.css`): page titles (`h1`).
- **Title** (600, 20px, 1.35): section, dialog and panel titles (`h2`), including the inspector node title and the Graph explorer heading.
- **Body** (400, 14px): UI text, tables and forms. Inputs use 16px on mobile to prevent zoom and 14px from `md` up.
- **Label** (500, 12px): badges, small buttons, graph node titles (550).
- **Section heading** (650, 12px, foreground, sentence case): the one small-heading role. Global `h3`, and the `sectionHeading` class for non-heading elements (Docs sidebar folders, "On this page"). Never uppercase or tracked.
- **Meta** (400, 11px): counts, relationship names and targets, nav rail labels, filter labels, pager labels.
- **Eyebrow** (650, 9px, tracked, uppercase copy): only the rail's storage-mode footer ("MEMORY", "FOLDER"). Never a kicker above a heading: page and panel titles carry their own weight. 9px is also the floor for count bubbles and mobile rail labels.
- **Mono** (11px): inline code and IDs in the UI; 13px in Docs code blocks.
- **Markdown body** (400, 14px, 1.75): rendered Markdown in previews (inspector, node page, Playground); 15px on the Docs page.
- **Docs Display** (600, 32px, -0.02em; 26px under 780px): rendered Markdown `h1` in the Docs preview, followed by a 17px muted lede. Docs `h2` is 22px with a hairline underline; `h3` is 17px. This is the only reading-scale type in the product.

### Named Rules

**The Weight Not Face Rule.** Build hierarchy with Geist weights between 550 and 700 and with tracking. Never add a second sans or a serif to the workspace.

**The Two Scales Rule.** App chrome uses only 9, 11, 12, 14, 20 and 25px (22px for the mobile headline, 23px for the wordmark). Reading scale (14–32px, generous margins) applies only inside `.markdown` previews. A new size in between is a bug.

## Layout

The workspace is a fixed three-zone frame filling the viewport (`h-dvh`):

- **Header** (68px; 58px under 780px): the wordmark, folder menu, search trigger (288px, shrinking to icon-only under 900px), and actions on the right (reload, language, theme). It's a card-white surface with a bottom hairline.
- **Nav rail** (80px; 58px under 780px): stacked icon-over-label items (19px icons, 11px labels; 9px under 780px), with issue count bubbles on icons.
- **Content**: scrolls independently. Pages use a centred container up to 1600px with 42px × 35px padding, stepping to 28px under 1100px and 18px × 23px under 780px.
- **Inspector / drawers**: the graph inspector is a 300px right column (260px under 1100px; it overlays as a 240px panel under 780px). Sheets slide from the right, can be resized from a left grip, and remember their width per key (minimum 320px).
- **Side lists under 780px**: the Graph explorer and the Docs page list stack above their content instead of sitting beside it. The Docs list folds behind a "Pages · <current page>" toggle that closes when a page is chosen.

Breakpoints are 1100px, 900px, 780px and 480px. Spacing follows Tailwind's 4px grid with fine-tuned steps (for example 25px header gaps). Density is moderate: 32px controls, 20px badges, 90px × 230px graph nodes.

## Elevation & Depth

Flat at rest, lifted only in response to state. Depth comes from tonal layering: lavender-paper canvas, then card-white surfaces, then popovers (a step lighter in dark mode), with lilac hairlines separating them. Shadows appear only for elements that float above the desk or have been picked up.

### Shadow Vocabulary

- **Node rest** (`box-shadow: 0 2px 7px #44354c08`): a barely-there settle under graph nodes, so they read as paper on the canvas.
- **Selection halo** (`box-shadow: 0 0 0 3px color-mix(in oklab, var(--ring) 12%, transparent)`): the selected graph node.
- **Drawer cast** (`box-shadow: -10px 0 30px #3b204410`): an inspector or plan drawer overlaying content.
- **Canvas controls** (`box-shadow: 0 1px 6px #41344712`): React Flow zoom controls.
- **Overlay**: shadcn `shadow-sm` / `shadow-md` for popovers, the open-screen card and the minimap panel.

### Named Rules

**The Lift On State Rule.** A surface at rest has no shadow beyond a node settle. Shadows mean floating (overlay, drawer, popover) or selected.

## Shapes

Corners are gently rounded and scale with the role, all derived from a 10px base radius:

- **10px** (`lg`): buttons, inputs, tab lists and the default for controls.
- **8px** (`md`): code blocks in docs; small buttons use min(8px, 12px).
- **7px** (`node`): graph nodes and nav rail items. It's the shape of a map card.
- **14px** (`xl`): the open-screen card.
- **6px** (`sm`): checkboxes, inline code in docs, and the React Flow controls and minimap.
- **Pills** (`pill`, 26px): badges and count bubbles (fully round).

Every radius comes from this list. 4px and 5px corners are not part of the system.

Borders are 1px hairlines. Graph nodes add a 3px left edge in their type colour (Simp Pink when selected). Missing nodes switch to a dashed border.

## Components

### Buttons

Soft, tinted and quiet until pressed.

- **Shape:** gently rounded (10px), 32px tall (24px xs, 28px sm, 36px lg), 10px horizontal padding, 14px medium text, 16px icons with a 6px gap.
- **Primary:** Simp Pink fill with white text. Hover drops to 80% opacity.
- **Secondary:** Blush Wash fill with Mulberry text. Hover mixes in 5% ink.
- **Outline:** a hairline border on lavender paper. Hover fills with Petal Mist.
- **Ghost:** transparent. Hover fills with Petal Mist.
- **Destructive:** a red wash (10%) with red text, never a solid red fill.
- **States:** focus shows a ring-coloured border plus a 3px ring at 50%. Pressing nudges the button 1px down. Disabled is 50% opacity with a not-allowed cursor (never the busy cursor).

### Badges / Type Chips

- **Style:** a pill, 20px tall, 12px medium text, with the type wash as fill and `--type-ink` as text, driven by the `--type-*` tokens. Issue severities (`error`, `warning`) reuse the same mechanism.
- **Use:** node type labels on nodes and tables, and severity in Issues. Badges carry no `title` help; meanings live in a Glossary.

### Glossary (term help)

A disclosure that is closed by default and sits under the list it explains: a 12px Dusty Mauve summary ("What these mean", "What these codes mean") behind a 14px chevron that turns 90° when open. Open, it lays out term and description pairs in a grid of columns at least 15rem wide (one column in narrow panels). Terms are 12px medium, or the badge itself; descriptions are 12px Dusty Mauve. It replaces hover-only `title` help on graph filters, the Nodes list, inspector and node relationships, and issue codes.

### Inputs / Fields

- **Style:** 32px, a 10px radius, a transparent fill with a Rose Input Edge border, and a Dusty Mauve placeholder. Dark mode fills with white at 30% of the input alpha.
- **Focus:** a Simp Pink Ring border plus a 3px ring at 50%.
- **Error / Disabled:** `aria-invalid` gives a red border and a 20% red ring. Disabled is 50% opacity on an input-tinted fill.

### Navigation

- **Rail items:** an icon above an 11px label, a 7px radius, and Dusty Mauve at rest. Hover and active states fill with Blush Wash and turn the icon and label Simp Pink. Error and warning count bubbles sit at the icon's top-right.
- **Header search:** an outline button styled as a field, on lavender paper, showing the ⌘K shortcut.
- **Skip link:** the first Tab stop, hidden until focused, then a Simp Pink pill at the top-left that jumps to the `<main id="content">` region. The rail is a labelled `<nav>`.
- **Count bubbles** are decorative (`aria-hidden`). The rail link carries the counts as hidden text, e.g. "Issues (2 errors · 0 warnings)".
- **Theme toggle:** its icon shows the theme it switches to (sun while dark), matching its label.

### Graph Node (signature)

A 230 × 90px map card: card-white with a 7px radius, a type badge above a 12px title (weight 550), and a 3px type-coloured left edge. Selection swaps that edge to Simp Pink and adds the pink halo. An issue count bubble overhangs the top-right corner (solid red for errors, an ochre wash for warnings). Missing ("ghost") nodes use a dashed hairline on a 10% red wash. Connection handles are 7px Dusty Mauve dots with a card-coloured ring.

The canvas around it is themed from tokens, not React Flow's stock grey or black: lavender-paper background, card-white controls and minimap, and Simp Pink Ring for the line drawn while connecting. The minimap fills each node with its `--type-color` (ghosts in red) under a 70% paper mask. It is hidden under 780px and turned off in small embedded graphs, where it would cover nodes.

### Inspector & Sheets

Card-white side panels with a hairline left border, opening straight on their title (no kicker). Their actions are pinned in a footer. Sheets are resizable from a slim left grip that darkens on hover.

### Rendered Markdown (Docs preview)

A reading surface: 32px headline with a muted 17px lede, 22px `h2` with a hairline rule, and links in Simp Pink underlined at 35% alpha (full on hover). Code blocks are hairline-bordered lavender panels with an 8px radius. Blockquotes have a 3px pink-ring left rule on Petal Mist.

## Do's and Don'ts

### Do:

- **Do** reach for theme tokens (`bg-card`, `text-muted-foreground`, `border-border`, `--type-color`) instead of literal colours, and define every new colour for both light and dark.
- **Do** keep Simp Pink for the active, selected or primary action, at most one primary button per view.
- **Do** carry node type through the `--type-color` / `--type-bg` class mechanism so badges, nodes and dots stay in sync.
- **Do** separate surfaces with lilac hairlines and tonal steps, and keep controls at 32px with a 10px radius.
- **Do** keep errors and warnings visible in chrome (count bubbles, banners) using Alarm Red and Amber Ochre washes.
- **Do** give every enum or code a visible explanation through a Glossary disclosure; a `title` tooltip may only repeat what is already visible.
- **Do** map third-party widget themes (React Flow) onto the tokens in both themes instead of accepting their stock greys.
- **Do** respect `prefers-reduced-motion`. The global reset already disables animation and transitions.

### Don't:

- **Don't** fall back to generic grey shadcn: untinted neutrals, stock `neutral` greys, or missing type colours.
- **Don't** drift into neon dev-tool dark. Dark mode is plum (#17131d), not black, and has no glowing accents.
- **Don't** add marketing gloss inside the app: gradients, glassmorphism, oversized hero type or decorative illustration.
- **Don't** let node-type colours leak into navigation, buttons or page chrome (rainbow chrome).
- **Don't** add resting shadows to cards or panels. Lift is reserved for overlays, drawers and selection.
- **Don't** use a solid red fill for destructive buttons. Use the 10% red wash with red text.
- **Don't** set text in `--type-color` or a raw status colour on its wash. Use the ink (The Readable Ink Rule).

---
name: product-kb-builder
description: Build, extend, or re-sync a Markdown graph knowledge base (kb-graph format — goals, procedures, capabilities, states, constraints as Markdown files with YAML frontmatter) from a product's codebase and docs, so an AI agent can search it and turn user goals into step-by-step plans. Use this whenever the user wants to create, bootstrap, populate, extend, update, or sync a product KB, agent knowledge base, or `kb/` folder from code or documentation; document what the product can do for an AI agent or support bot; add a feature or module to the KB; add or refresh screenshots of the product's screens for the KB's docs; or fix simp-lint errors — even if they don't say "kb-graph" or "skill".
---

# Product KB Builder

The KB answers one question for an AI agent: **"What do I need to do to achieve X in this product?"**
It is a graph of Markdown files. The agent finds a goal with `search_kb`, then `resolve_goal` turns it into
an ordered plan (checks, fixes, choices, constraints). Your job is to extract that graph from the product's
code and docs — accurately, with evidence, in a shape the tooling can resolve.

Markdown in Git is the source of truth. Everything else (graph, search index) is rebuilt from it, so the
quality of what you write here is the quality of the agent's answers.

## Before you start

`<skill>` below means the directory containing this SKILL.md.

1. **Find the tooling.** Run `npx simp-lint --help`. If it is missing, ask the user where
   `@sontx/simplink-core` is installed (in this repository, after `pnpm build`:
   `node packages/core/dist/cli.js`, `search-cli.js`, and `resolve-cli.js`). You need `simp-lint`,
   `simp-search`, and `simp-resolve` throughout.
2. **Find the KB directory** (default `kb/`). If it already has files, you are in **update mode**: run
   `simp-lint` first, read `kb/INVENTORY.md` and root `kb/simp.md` if they exist, and work incrementally
   (see "Update mode"). A KB without `simp.md` gets one in this pass. If `simp.md` has a `checkpoint`,
   update mode reads only what changed since it — not the whole product.
3. **Read `references/schema.md` now.** It defines every field, edge, and lint code. Writing files from
   memory of the format causes lint churn.
4. **Ask two things** if the user hasn't said: the KB's primary language for titles and steps
   (`when_to_use` follows it too; aliases may mix languages), and which product areas are in scope.

## Phase 1 — Discover and inventory (write no KB nodes yet)

Read `references/discovery.md` for where to look, and `references/modeling-guide.md` for how to turn
what you find into node types.

1. Map the product's surface: navigation/routes, API endpoints, i18n label files, plan/permission/feature-flag
   config, validation and error messages, status enums, and the docs or help center.
2. Group findings into **areas** (a menu section or module the product team would recognize).
3. For each area, list candidate nodes: id, type, title, one line of evidence (file path or doc URL),
   and anything uncertain.
4. Collect the **product manifest** facts for root `simp.md`: a stable kebab-case product `name`
   (package name, repo name, or brand), display title, a one-line summary from the README or landing
   page, the KB language, and any sibling products this one depends on or links to (candidate `peers`).
   Pick the 3–8 goals a new user would start from as the homepage's entry links.
5. Write `kb/INVENTORY.md` from `assets/templates/INVENTORY.md`, including the `simp` row in its
   "Product manifest" section. Root files other than `simp.md` are ignored by the loader, so the
   inventory never pollutes the graph.
6. If the product has a UI, note in each procedure, state, and capability row which screens deserve a
   screenshot (`screens: step 1 (form)`), following §1–2 of `references/screenshots.md`. Most rows get
   none.
7. **Stop and ask the user to review the inventory.** Summarize: product name and summary, areas, node
   counts per type, the goals (these define what the agent can help with), the proposed entry goals and
   peers, the planned screenshots, and the open questions. Ask how to run the product, which demo data
   and sign-in to use, and whether to capture screenshots at all. Do not draft nodes until the user
   approves or adjusts.

The approval gate exists because rewriting a wrong model is expensive: goals are user intents, and the
product team knows the real intents better than the code does. A 5-minute review here saves rewriting
dozens of files and their links.

## Phase 2 — Draft one area at a time

For each approved area, in this order (so every reference already exists when you link to it):

1. constraints → 2. capabilities → 3. states → 4. procedures → 5. goals

For each node:

- Create the file with `node <skill>/scripts/new_node.mjs <id> --kb kb`. It derives the correct path
  from the id and fills the right template; hand-made paths are the most common lint failure (E002/E004).
- Fill it from evidence only. List the evidence paths under the node's ID in `kb/simp-sources.yaml`
  (see `references/schema.md` §2), never in frontmatter — update mode depends on them, and frontmatter
  is served to agents and peers while the sidecar is not.
- Prefer `simp://` Markdown body links; use `simp:///goal.area.task` locally and `simp://peer/goal.area.task` remotely. Wikilinks remain supported.
- Write steps as the **user** experiences them (UI labels from the i18n files, or public API calls),
  never internal function names.
- Write `when_to_use` only in the KB's primary language — the same language as the body — because it is
  rendered into the exported docs. `aliases` are search-only and may hold many terms in any languages
  users search in (for example Vietnamese with diacritics and English). Both use the words a real user
  would type — see the modeling guide's retrieval section.
- If something is inferred rather than evidenced, add `needs-review` to `tags` and a line
  `Unverified: <what and why>` in the body. Never present a guess as fact; the agent will repeat it to users.

After each area:

1. Run `npx simp-lint kb`. Fix every error before moving on (see the fix table in `references/schema.md`).
   Errors compound across areas because later nodes link to earlier ones.
2. Run `node <skill>/scripts/inventory_check.mjs --kb kb` and update each row's status in `INVENTORY.md`.
3. Tell the user briefly what was added, then continue to the next area.

### Last step of Phase 2 — the product manifest `simp.md`

Every KB you build gets a root `simp.md`. It names the product for federation (peers reference it by
`name`), sets the default language, and its body is the **homepage** of exported docs (`simp-docs`), so
a KB without it has no front page and no identity. Write it after the goals exist, because its body
links to them (see "Product manifest and federation" in `references/schema.md`):

1. Create it with `node <skill>/scripts/new_node.mjs simp --kb kb` (never by hand).
2. Fill `name` (stable lowercase kebab-case; changing it later breaks every peer that references it),
   `title`, `summary`, and multilingual `aliases`. Set `language` to the KB's primary language.
3. Body: two or three sentences on what the product is for, then a `## Start here` list linking the
   approved entry goals, e.g. `- [Import customers](simp:///goal.import.customers)`. Link goals, not
   procedures; the resolver and docs reach the rest of the graph from them.
4. Declare `peers` only for products the user confirmed. Leave `docs_url` out until this KB's own
   graph-layout docs export (`simp-docs --layout graph`) is published; never point it at a regular docs site.
5. Keep `serves: [pull]` unless the user asks for remote plan resolution. No credentials or tokens.
6. Put the evidence (README, package manifest, landing page) under `simp:` in `kb/simp-sources.yaml`, run `simp-lint`, and mark
   the `simp` inventory row `drafted`.

### Finish every pass — write the checkpoint

After Phase 4 passes with zero lint errors (first build and every update), record where the KB now
stands in `simp.md` so the next update can skip unchanged code:

```yaml
checkpoint:
  updated_at: "2026-01-31T09:00:00Z" # date -u +%Y-%m-%dT%H:%M:%SZ
  commit: "0123abc…" # git -C <product repo> rev-parse HEAD
```

Use the commit you actually read, not one made later. Omit `commit` when the source isn't a Git repo.
If the working tree had uncommitted changes you documented, say so in the report — the next diff from
`commit` will show them again, which is safe. Never advance the checkpoint after a partial or failing
pass; the next update would silently skip what this one missed.

`kb/simp-sources.yaml`, `kb/INVENTORY.md`, and the checkpoint commit are authoring metadata. Simplink's
tools never serve the first two; when someone hosts the KB folder as static files, tell them to leave
those two out.

## Phase 3 — Screenshots (UI products, when the user agreed)

Screenshots make the exported guides usable by people; agents read only their alt text. Follow
`references/screenshots.md`:

1. Check the capture tools first: `node <skill>/scripts/capture.mjs --kb kb --check`. It needs Node.js
   20+, `playwright` and `sharp` (pinned in `DEPS` at the top of the script), and Chrome, Edge, or
   Playwright's Chromium. When something is missing it prints the exact install command; ask the user
   before installing, into a scratch folder passed as `--deps`, never into the product.
2. Launch the product the documented way (project skill, `CLAUDE.md`, `README`, package scripts) with
   demo data. Ask instead of guessing when it needs services or credentials you don't have.
3. Write the approved shots into `kb/assets/shots.json`: where to go, what to click first, which
   control to highlight, what to mask, what to crop to. When several steps happen on one screen (a
   form), take one image and mark each step's control with its step number instead of one image per
   step.
4. Run `node <skill>/scripts/capture.mjs --kb kb`. It captures, highlights, masks, crops, and
   compresses each image (WebP by default) and warns about large files. Open every image and recapture
   the wrong ones.
5. Link each image inside its step (procedures) or in the body (states, capabilities), with alt text
   that describes the screen and the highlighted control in the KB's language.
6. Stop the servers you started. Run `simp-lint`: no W110 (missing image) or W111 (no alt text).

Skip this phase for API-only or CLI products, and when the product can't run with safe demo data.

## Phase 4 — Verify retrieval and plans

Lint checks structure, not usefulness. Check usefulness directly:

1. **Retrieval.** For each goal, write 2–3 queries a real user might type — at least one in Vietnamese and
   one in English, _not_ copied from its aliases. Run `npx simp-search "<query>" --kb kb`. The goal should
   appear in the top 3 `Goals`. If it doesn't, improve `aliases` / `when_to_use`, not the query — a miss in a
   language other than the KB's goes into `aliases`, never `when_to_use`.
2. **Plans.** Run `npx simp-resolve <goal-id> --kb kb` for each goal and read it as the user would:
   - Is a prerequisite missing? Add a `preconditions` state (with `satisfied_by`) or a `requires` procedure.
   - Does a step depend on a decision? Model it as a `choices` entry.
   - Does a plan-gated feature show the right availability? Check `availability`.
   - Do blocking constraints appear?
3. **Homepage.** Re-read `simp.md`: every entry link resolves (lint reports broken `simp://` links), the
   summary matches what the KB actually covers, and no major goal area is missing from "Start here".
4. **Guides.** With screenshots, export the docs (`simp-docs --kb kb --out <scratch>/docs`) and open a
   goal guide and a procedure page: each image loads beside its step, and `simp-resolve` shows its alt
   text as a `Screen:` line under that step.
5. Finish with zero lint errors. Warnings are acceptable only with a reason (e.g. W101 for a node kept for
   future linking); list them in the report.

## Phase 5 — Report

Give the user a short report:

- Product manifest: `name`, `language`, entry goals, declared peers (or why none), and the new
  `checkpoint` (or why it was not advanced).
- Areas covered, node counts per type, goals added.
- Retrieval results: queries that failed to find their goal, if any.
- Screenshots: how many, the total size of `kb/assets/`, and shots skipped or failed with the reason.
- Every `needs-review` node with its open question.
- Remaining warnings and why.
- Suggested next areas.

## Update mode (KB exists, code changed)

1. Get the changed paths since the last pass — and only those; don't re-read the whole product:
   - `checkpoint.commit` in `simp.md` → `git diff --name-status <commit> HEAD` (add `git status --porcelain`
     for uncommitted work). If the commit is unknown locally (shallow clone, rewritten history), try
     `git fetch --deepen`, then fall back to `git log --since=<checkpoint.updated_at> --name-status`.
   - Only `checkpoint.updated_at` → `git log --since=<updated_at> --name-status --format=` .
   - No checkpoint → ask the user for a base (`git diff --name-only <base>...HEAD`), or do a full pass.
   Ignore paths outside the documented scope (tests, lockfiles, CI) unless they change behavior.
   Renamed paths (`R` status) need their entries in `kb/simp-sources.yaml` rewritten.
2. Find affected nodes from `kb/simp-sources.yaml` (this is what it is for):
   `awk '/^[^ ]/{id=$0; sub(/:$/, "", id)} index($0, "<changed path>"){print id}' kb/simp-sources.yaml | sort -u`.
   If lint reports W112, the KB predates the sidecar: move each node's inline `sources:` into
   `kb/simp-sources.yaml` first. W113 means an entry outlived its node; rename or drop the key.
3. Re-read the changed code and update those nodes; add new nodes for new surface; set
   `status: deprecated` on removed features rather than deleting them immediately, so agents and links
   degrade gracefully (lint W104 then shows who still references them).
4. Keep `simp.md` in sync: add new entry goals to "Start here", remove links to deprecated goals, and
   update `summary` when the product's scope changes. Never rename `name`. Create the manifest if the KB
   predates it.
5. Recapture the screenshots of affected nodes (`capture.mjs --only <node id>`) and act on each
   result: `same` needs nothing; `CHANGED`/`REVIEW` means open the image and update its alt text and
   steps; `FAIL` keeps the old image and names what broke (a renamed label lists the current names).
   Move an image with its step when steps change. See §9 of `references/screenshots.md`.
6. Re-run Phase 4 for the affected goals only, then advance `checkpoint` (see "Finish every pass").
   If nothing in scope changed, still advance it so the next pass starts later.

## Quality bar

- **Goals are user intents, not screens.** "Send an SMS broadcast" is a goal; "Broadcast settings page"
  is not. If you cannot phrase it as "I want to …", it is not a goal.
- **One procedure = one coherent way to do something.** If two paths share most steps and differ at one
  point, use `choices`; if they differ end to end, make two procedures under the goal.
- **States are checkable.** Every state needs a `check` a user or agent can actually perform.
- **Constraints come from evidence** (validation code, limits, policies), not intuition.
- **No secrets or private data.** Never copy keys, internal hostnames, customer data, or credentials from
  code into the KB. The KB may be served to tenants.
- **Prefer fewer, accurate nodes** over broad, speculative coverage. A missing node is a known gap; a wrong
  node is a confident wrong answer.
- **Screenshots earn their place.** Only where a reader could get lost, from demo data, in the KB's
  language, masked, cropped, and compressed. A stale or wrong screenshot misleads more than none.

## Files in this skill

| Path                           | Read when                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `references/schema.md`         | Before writing any node; when fixing lint errors                                    |
| `references/modeling-guide.md` | Phase 1 (choosing node types), Phase 2 (aliases, steps), Phase 4 (fixing retrieval) |
| `references/discovery.md`      | Phase 1 and update mode                                                             |
| `references/screenshots.md`    | Phase 1 (planning screens), Phase 3, and update mode for nodes with images          |
| `assets/templates/*.md`        | Used by `new_node.mjs`; read only to change templates                               |
| `scripts/new_node.mjs`         | Create every node file, including root `simp.md` (`new_node.mjs simp`)              |
| `scripts/inventory_check.mjs`  | After each area; before the report                                                  |
| `scripts/capture.mjs`          | Phase 3: capture, highlight, and compress the shots in `kb/assets/shots.json`       |

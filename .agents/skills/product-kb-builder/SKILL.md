---
name: product-kb-builder
description: Build, extend, or re-sync a Markdown graph knowledge base (kb-graph format — goals, procedures, capabilities, states, constraints as Markdown files with YAML frontmatter) from a product's codebase and docs, so an AI agent can search it and turn user goals into step-by-step plans. Use this whenever the user wants to create, bootstrap, populate, extend, update, or sync a product KB, agent knowledge base, or `kb/` folder from code or documentation; document what the product can do for an AI agent or support bot; add a feature or module to the KB; or fix simp-lint errors — even if they don't say "kb-graph" or "skill".
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
   `simp-lint` first, read `kb/INVENTORY.md` if it exists, and work incrementally (see "Update mode").
3. **Read `references/schema.md` now.** It defines every field, edge, and lint code. Writing files from
   memory of the format causes lint churn.
4. **Ask two things** if the user hasn't said: the KB's primary language for titles and steps
   (aliases are always bilingual Vietnamese + English), and which product areas are in scope.

## Phase 1 — Discover and inventory (write no KB nodes yet)

Read `references/discovery.md` for where to look, and `references/modeling-guide.md` for how to turn
what you find into node types.

1. Map the product's surface: navigation/routes, API endpoints, i18n label files, plan/permission/feature-flag
   config, validation and error messages, status enums, and the docs or help center.
2. Group findings into **areas** (a menu section or module the product team would recognize).
3. For each area, list candidate nodes: id, type, title, one line of evidence (file path or doc URL),
   and anything uncertain.
4. Write `kb/INVENTORY.md` from `assets/templates/INVENTORY.md`. Files at the KB root are ignored by the
   loader, so the inventory never pollutes the graph.
5. **Stop and ask the user to review the inventory.** Summarize: areas, node counts per type, the goals
   (these define what the agent can help with), and the open questions. Do not draft nodes until the
   user approves or adjusts.

The approval gate exists because rewriting a wrong model is expensive: goals are user intents, and the
product team knows the real intents better than the code does. A 5-minute review here saves rewriting
dozens of files and their links.

## Phase 2 — Draft one area at a time

For each approved area, in this order (so every reference already exists when you link to it):

1. constraints → 2. capabilities → 3. states → 4. procedures → 5. goals

For each node:

- Create the file with `node <skill>/scripts/new_node.mjs <id> --kb kb`. It derives the correct path
  from the id and fills the right template; hand-made paths are the most common lint failure (E002/E004).
- Fill it from evidence only. Put the evidence paths in `sources:` — update mode depends on them.
- Write steps as the **user** experiences them (UI labels from the i18n files, or public API calls),
  never internal function names.
- Write `aliases` and `when_to_use` in both Vietnamese (with diacritics) and English, in the words a
  real user would type — see the modeling guide's retrieval section.
- If something is inferred rather than evidenced, add `needs-review` to `tags` and a line
  `Unverified: <what and why>` in the body. Never present a guess as fact; the agent will repeat it to users.

After each area:

1. Run `npx simp-lint kb`. Fix every error before moving on (see the fix table in `references/schema.md`).
   Errors compound across areas because later nodes link to earlier ones.
2. Run `node <skill>/scripts/inventory_check.mjs --kb kb` and update each row's status in `INVENTORY.md`.
3. Tell the user briefly what was added, then continue to the next area.

## Phase 3 — Verify retrieval and plans

Lint checks structure, not usefulness. Check usefulness directly:

1. **Retrieval.** For each goal, write 2–3 queries a real user might type — at least one in Vietnamese and
   one in English, _not_ copied from its aliases. Run `npx simp-search "<query>" --kb kb`. The goal should
   appear in the top 3 `Goals`. If it doesn't, improve `aliases` / `when_to_use`, not the query.
2. **Plans.** Run `npx simp-resolve <goal-id> --kb kb` for each goal and read it as the user would:
   - Is a prerequisite missing? Add a `preconditions` state (with `satisfied_by`) or a `requires` procedure.
   - Does a step depend on a decision? Model it as a `choices` entry.
   - Does a plan-gated feature show the right availability? Check `availability`.
   - Do blocking constraints appear?
3. Finish with zero lint errors. Warnings are acceptable only with a reason (e.g. W101 for a node kept for
   future linking); list them in the report.

## Phase 4 — Report

Give the user a short report:

- Areas covered, node counts per type, goals added.
- Retrieval results: queries that failed to find their goal, if any.
- Every `needs-review` node with its open question.
- Remaining warnings and why.
- Suggested next areas.

## Update mode (KB exists, code changed)

1. Get the changed paths (`git diff --name-only <base>...HEAD`, or ask the user).
2. Find affected nodes: `grep -rl "<changed path>" kb/` (this is what `sources:` is for).
3. Re-read the changed code and update those nodes; add new nodes for new surface; set
   `status: deprecated` on removed features rather than deleting them immediately, so agents and links
   degrade gracefully (lint W104 then shows who still references them).
4. Re-run Phase 3 for the affected goals only.

## Quality bar

- **Goals are user intents, not screens.** "Send a Zalo broadcast" is a goal; "Broadcast settings page"
  is not. If you cannot phrase it as "I want to …", it is not a goal.
- **One procedure = one coherent way to do something.** If two paths share most steps and differ at one
  point, use `choices`; if they differ end to end, make two procedures under the goal.
- **States are checkable.** Every state needs a `check` a user or agent can actually perform.
- **Constraints come from evidence** (validation code, limits, policies), not intuition.
- **No secrets or private data.** Never copy keys, internal hostnames, customer data, or credentials from
  code into the KB. The KB may be served to tenants.
- **Prefer fewer, accurate nodes** over broad, speculative coverage. A missing node is a known gap; a wrong
  node is a confident wrong answer.

## Files in this skill

| Path                           | Read when                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `references/schema.md`         | Before writing any node; when fixing lint errors                                    |
| `references/modeling-guide.md` | Phase 1 (choosing node types), Phase 2 (aliases, steps), Phase 3 (fixing retrieval) |
| `references/discovery.md`      | Phase 1 and update mode                                                             |
| `assets/templates/*.md`        | Used by `new_node.mjs`; read only to change templates                               |
| `scripts/new_node.mjs`         | Create every node file                                                              |
| `scripts/inventory_check.mjs`  | After each area; before the report                                                  |

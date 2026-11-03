# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: **KB authors and maintainers**, meaning developers and technical writers who build and maintain a product knowledge base. In the browser workspace they edit node files, fix lint issues, check graph health (orphans, broken relationships, deprecated nodes), and preview the agent plans and reader docs the KB produces before agents or readers rely on it. They work at a desk, in long sessions, often next to an editor and a terminal running `simp-lint`.

Secondary (unconfirmed priority): developers who wire a KB into an agent through MCP or embed the core tools, and people who connect the UI read-only to a running simp node.

## Product Purpose

Simplink turns linked Markdown into searchable product guidance, executable plans, documentation, and federated knowledge-base tools. Product knowledge lives as a typed graph of Markdown files with YAML frontmatter, and Simplink validates it, searches it, and resolves user goals into step-by-step plans that agents can follow.

Success for the UI: an author can open a KB, see what is broken or missing, fix it, and confirm that the plans and docs coming out are right, all without leaving the browser.

## Positioning

Knowledge is a **typed, linted Markdown graph** (goals, procedures, capabilities, constraints, states), not loose pages or embedded chunks. It resolves into **context-dependent agent plans** (account plan, permissions, known conditions, choices). The same source also exports reader-facing docs and federates with other products' KBs through simp nodes and peers. A docs site or vector-search RAG setup cannot truthfully claim graph validation, deterministic plan resolution, or one source for both agents and humans.

## Operating Context

- Packages: `@sontx/simplink-core` (CLI: `simp`, `simp-lint`, `simp-resolve`, `simp-search`, `simp-docs`), `@sontx/simplink-mcp` (stdio and HTTP MCP server), `@sontx/simplink-node` (federated HTTP simp node), `@sontx/simplink-ui` (static browser workspace).
- The UI is a static Vite SPA with no backend, hosted at `https://simp.sontx.dev` (Cloudflare assets) or self-hosted, including under a subpath.
- Workflows: open a local KB folder (Chromium writes directly; other browsers edit in memory and must download a zip to keep changes) or connect read-only to a simp node; browse Graph, Nodes, Playground, Issues, Docs, and Skills; edit Markdown source; create and delete nodes; manage relationships.
- Authors pair the UI with git, an editor, and the CLI linter. Agents consume the KB through MCP.

## Capabilities and Constraints

- Node types: goal, procedure, capability, constraint, state, plus a root `simp.md` that declares peers.
- All KB operations run in the browser. Folder access requires HTTPS or localhost and permission. Dot-files are excluded. Git URLs are unsupported.
- Unsaved memory edits must be guarded when closing, switching folders, reloading, or refreshing.
- The Playground reads data and gives guidance. It never executes procedures or changes files.
- Connected simp-node workspaces are read-only, and their editing controls are hidden.
- Languages: English and Vietnamese (`en`/`vi`). Light theme by default, plus dark.
- Terminology: "simp" (command prefix, node, `simp.md`), "KB", "node", "peer", "plan", "Agent plan".

## Brand Commitments

- Name: **Simplink**, written lowercase as "simplink" in the UI title ("simplink — Knowledge workspace"). The "simp" prefix is used for commands and nodes.
- Logo: `packages/ui/public/logo.svg`.

## Evidence on Hand

- Simplink's own KB in `kb/` (with coverage tracked in `kb/INVENTORY.md`) and the synthetic fixture KB in `test/fixtures/kb/`. Both are real content for demos and previews.
- Bundled agent skills in `.agents/skills/` (downloadable from the Skills route).
- No testimonials, customer names, usage metrics, benchmarks, or pricing exist. Do not invent them.

## Product Principles

1. **The graph is the source of truth.** Every view shows the same validated graph. Nothing in the UI drifts from what `simp-lint` and the resolver say.
2. **Problems first.** Lint errors, warnings, orphans, and broken links are always visible and lead straight to the fix.
3. **Show the output, not just the input.** Authors should see the agent plan and reader docs a node produces, next to the source that produces them.
4. **Never lose an author's work.** Storage mode (direct folder or memory) is always clear, and destructive or unsaved transitions are guarded.
5. **Local and serverless.** The KB stays in the author's browser and files. The UI never needs a backend.

## Accessibility & Inclusion

Bilingual (English and Vietnamese) UI copy must stay complete in both languages. No formal standard has been set.

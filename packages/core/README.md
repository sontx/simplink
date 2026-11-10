# @sontx/simplink-core

[![npm version](https://img.shields.io/npm/v/@sontx/simplink-core.svg)](https://www.npmjs.com/package/@sontx/simplink-core)
[![node](https://img.shields.io/node/v/@sontx/simplink-core.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@sontx/simplink-core.svg)](https://github.com/sontx/simplink/blob/main/LICENSE)

> Turn linked Markdown into searchable product guidance, step-by-step agent plans, and reader-facing docs.

Simplink stores product knowledge as a **typed graph of Markdown files**:
goals, procedures, capabilities, states, and constraints, each with YAML
frontmatter. This package loads that graph, validates it, searches it, resolves
a user's goal into an ordered plan that fits their context, and exports the
same source as a documentation site.

**Try it in your browser:** [simp.sontx.dev](https://simp.sontx.dev) is the
Simplink workspace. Open a local KB folder or connect to a running simp node to
browse the graph, fix lint issues, preview agent plans, and download docs. No
install is needed, and your files stay in your browser.

## Contents

- [Features](#features)
- [Install](#install)
- [Quick start](#quick-start)
- [Concepts and terms](#concepts-and-terms)
- [CLI](#cli)
- [Library API](#library-api)
- [Exporting docs](#exporting-docs)
- [Extensions](#extensions)
- [Related packages](#related-packages)
- [Migrating to 0.2.0](#migrating-to-020)
- [License](#license)

## Features

- **Validation:** JSON Schema checks for every node type, plus graph lint for
  broken links, cycles, orphans, and wrong reference types (`simp-lint`).
- **Search:** BM25 full-text search with fuzzy and prefix matching that
  surfaces the goals behind matching nodes (`simp-search`).
- **Plan resolution:** Turns a goal into ordered steps, filling in prerequisites,
  required states, choices, constraints, and plan or permission availability
  (`simp-resolve`).
- **Docs export:** Generates a Markdown site with guides, reference, and
  troubleshooting sections, or a page-per-node graph layout (`simp-docs`).
- **Agent tools:** Provider-independent tool definitions (`search_kb`,
  `resolve_goal`, `resolve_procedure`, `get_node`, `get_related`) that you can
  plug into any LLM tool-calling loop.
- **Pluggable:** Supports filesystem, in-memory, and Git sources, plus custom
  validators, lint rules, search engines, availability policies, renderers,
  and tools.
- **Localization:** English and Vietnamese are built in, and you can add other
  languages.
- ESM, TypeScript declarations, and bundled JSON schemas
  (`@sontx/simplink-core/schemas/*`). The package has no MCP dependency and
  includes a browser entry at `@sontx/simplink-core/browser`.

## Install

```sh
npm install @sontx/simplink-core
# or run the CLI without installing
npx @sontx/simplink-core lint ./kb
```

Requires Node.js 22 or newer. Git must be installed only if you use `gitSource`.

## Quick start

### 1. Write a small KB

```text
kb/
├── simp.md
├── goals/send-broadcast.md
├── procedures/broadcast/send.md
├── procedures/channel/connect.md
└── states/channel/connected.md
```

```md
<!-- kb/simp.md  →  the KB's root manifest -->

---

type: simp
name: demo
title: Demo product
summary: Messaging guidance for the demo product.
---
```

```md
<!-- kb/goals/send-broadcast.md  →  id: goal.send-broadcast -->

---

type: goal
title: Send a broadcast
summary: Broadcast a message to an audience.
when_to_use: [Send a message to many customers at once]
procedures: [procedure.broadcast.send]
---
```

```md
<!-- kb/procedures/broadcast/send.md  →  id: procedure.broadcast.send -->

---

type: procedure
title: Send a broadcast
summary: Deliver a message to an audience.
preconditions: [state.channel.connected]
availability:
plans: [pro]
---

## Steps

1. Select an audience.
2. Write the message and send it.
```

```md
<!-- kb/states/channel/connected.md  →  id: state.channel.connected -->

---

type: state
title: Channel connected
summary: The messaging channel is connected.
check: Check the channel connection indicator.
satisfied_by: [procedure.channel.connect]
---
```

```md
<!-- kb/procedures/channel/connect.md  →  id: procedure.channel.connect -->

---

type: procedure
title: Connect the channel
summary: Connect the messaging channel.
produces: [state.channel.connected]
---

## Steps

1. Open channel settings and connect.
```

### 2. Validate, search, and resolve

```sh
npx simp-lint ./kb
npx simp-search "send to many customers" --kb ./kb
npx simp-resolve goal.send-broadcast --kb ./kb --plan pro
```

The resolver produces a plan that checks whether the channel is connected,
connects it if it isn't, and then sends the broadcast. If you already know the
channel is connected, pass `--state state.channel.connected=true` and the plan
skips the check and the connect step.

### 3. Use it from code

```ts
import { createKB } from "@sontx/simplink-core";

const kb = await createKB("./kb");
const found = await kb.search("send to many customers");
const plan = kb.resolveGoal(found.goals[0].id, {
  states: { "state.channel.connected": true },
});
const { text } = await kb.render(plan, { tokenBudget: 1500 });
console.log(text);
```

## Concepts and terms

Simplink introduces several terms. You need to know these to write a KB or read
the API.

### Knowledge base (KB)

A **KB** is a folder of Markdown files. Each file is one **node**, and the
frontmatter fields that point at other nodes are **edges**. Together they form
a graph that Simplink validates and traverses. Dot-files and non-Markdown files
are ignored.

### Node types

Each node declares a `type`, which must match its top-level folder.

| Type           | Folder          | What it means                                                                                                                                                 |
| -------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **goal**       | `goals/`        | Something a user wants to achieve, phrased in their terms. It is the entry point for search and planning and lists the procedures that can achieve it.        |
| **procedure**  | `procedures/`   | A concrete how-to with `## Steps`. It can require other procedures, need states, produce states, use capabilities, and offer choices.                         |
| **capability** | `capabilities/` | A product feature or ability that procedures use, such as "scheduled sending". It explains what the product can do.                                           |
| **state**      | `states/`       | A condition that can be true or false, such as "channel connected". It has a `check` that explains how to verify it and lists the procedures that satisfy it. |
| **constraint** | `constraints/`  | A rule, limit, or policy with a `severity`, such as consent requirements or rate limits. It is attached to procedures and capabilities.                       |
| **simp**       | `simp.md`       | The KB's root manifest: product `name`, `language`, published `docs_url`, and the **peers** it federates with. Its body can serve as the docs homepage.       |

Every node needs `title` and `summary`. Optional fields include `aliases` and
`tags` (indexed for search), `related`, `status: deprecated`, `availability`,
and `docs`.

### Source evidence

Record the repo paths or doc URLs each node was derived from in
`simp-sources.yaml` at the KB root, keyed by node ID. Update passes use it to
find the nodes a change affects:

```yaml
goal.mcp.connect-agent:
  - packages/mcp/src/bin.ts
simp:
  - README.md
```

The file is authoring metadata and is never served: `get_node`, simp-node
lookups, static peers, the KB proxy, `simp-index`, and docs export all leave it
out. Don't upload it when you host a KB folder as static files. Lint reports a
malformed file (E017) and entries for missing nodes (W113). An inline `sources`
frontmatter field is still accepted but deprecated (W112), and served output
strips it.

### Images

Screenshots make guides easier to follow. Write them as ordinary Markdown
images in a node's body, with paths relative to the node file, so any editor
previews them. Keep image files in a folder such as `assets/`; the loader skips
non-Markdown files.

```md
<!-- procedures/broadcast/send.md -->

## Steps

1. Select an audience.

   ![Audience picker with the Segment dropdown open](../../assets/broadcast/audience.png)

2. Write the message and send it.
```

- **Procedures:** an image written in a `## Steps` item, on its line or the
  lines under it, belongs to that step. Plans take it out of the step text and
  attach it to the step. Agents get its alt text as a `Screen:` line under the
  step, never the image, and goal guides show the image under the step.
- **States:** the body's images show what the state looks like when it's true.
  They go with the state's check in plans and guides.
- **Any node:** docs export rewrites local image paths to follow the published
  page. External URLs stay as written, and images in code are ignored.
- **Alt text:** describe what's on the screen, because that's all an agent
  sees. Lint flags an image with no alt text (W111) and, for filesystem KBs and
  custom sources that implement `assets()`, a missing image file (W110).

### Node IDs

IDs come from the file path: `procedures/broadcast/send.md` becomes
`procedure.broadcast.send`. The type prefix is singular, the segments are
lowercase kebab-case, and renaming a file changes its ID. To refer to a node in
another product's KB, prefix the ID with that product's simp name, for example
`crm:state.customers-imported`.

### Edges

| Field                    | On                    | Points to    | Meaning                                              |
| ------------------------ | --------------------- | ------------ | ---------------------------------------------------- |
| `procedures`             | goal                  | procedures   | Alternative ways to reach the goal                   |
| `requires`               | procedure             | procedures   | Procedures that must be done first                   |
| `requires`               | capability            | capabilities | Capabilities this one depends on                     |
| `preconditions`          | procedure             | states       | States that must be true before starting             |
| `optional_preconditions` | procedure             | states       | Helpful but not required states                      |
| `produces`               | procedure             | states       | States that are true after the procedure runs        |
| `satisfied_by`           | state                 | procedures   | How to make the state true                           |
| `uses`                   | procedure             | capabilities | Features the procedure relies on                     |
| `constrained_by`         | procedure, capability | constraints  | Rules that apply                                     |
| `choices`                | procedure             | procedures   | A question with options, each leading to a procedure |
| `related`                | any                   | any node     | Loose "see also" link                                |

In prose, link nodes with `[[procedure.broadcast.send]]` wikilinks or canonical
`simp:///goal.local` links. For another product, use `simp://crm/goal.import`.

### Resolution and plans

**Resolving** a goal walks the graph from the goal. For each step, the resolver
picks the best procedure, adds the procedures that satisfy unmet preconditions,
orders prerequisites first, and gathers constraints, choices, and warnings. The
result is a **plan**. `render` turns a plan into compact Markdown that fits a
token budget, ready for an agent prompt.

Plans depend on context:

- **Known states** (`--state id=true|false`) skip steps that are already
  satisfied.
- A **tenant** describes who is asking: their account `plan`, their
  `permissions`, and app-specific `context`. Nodes can declare `availability`
  (`plans`, `permissions`). The resolver prefers available alternatives and
  marks unavailable ones. Availability is advice for planning, not access
  control.

### Lint

**Lint** runs schema validation and graph checks. Errors (`E0xx`) block search,
resolve, and docs export. Warnings (`W1xx`) report problems such as orphan nodes
or deprecated links. `--max-warnings` turns warnings into failures for CI.

### Federation: simp, peers, and simp nodes

- A **simp** is a KB that is identified by the `name` in its `simp.md`. The
  `simp` prefix also names the CLI commands.
- A **peer** is another simp that this KB declares in `simp.md`. It can be a
  running simp node, a statically hosted KB, or a local folder. Once a peer is
  declared, nodes can reference its nodes with qualified IDs such as `crm:goal.x`.
- A **simp node** is an HTTP server that serves a KB to peers and to the
  browser workspace. It is provided by
  [`@sontx/simplink-node`](https://www.npmjs.com/package/@sontx/simplink-node).
- **Serving modes:**
  - In **pull** mode (the default), consumers fetch remote nodes and plan
    locally.
  - In **delegate** mode, the remote simp resolves the plan itself.
- **simp index** (`simp-index.yaml`) is an optional search index that you
  publish beside a static KB so that peers can search it.

## CLI

`simp` bundles all commands. On an interactive terminal, it prompts for any
missing arguments and shows progress. In pipes or CI, it prints plain output.
Each command is also available as its own executable, and every command
supports `--help`.

| Command        | Standalone bin | Purpose                                       |
| -------------- | -------------- | --------------------------------------------- |
| `simp lint`    | `simp-lint`    | Validate schemas and graph rules              |
| `simp search`  | `simp-search`  | Full-text search over nodes and goals         |
| `simp resolve` | `simp-resolve` | Resolve a goal into a plan                    |
| `simp docs`    | `simp-docs`    | Export a Markdown docs site                   |
| `simp index`   | `simp-index`   | Write `simp-index.yaml` for static publishing |

```sh
simp                                   # pick a command interactively
simp lint ./kb --max-warnings 0        # fail CI on any warning
simp-lint ./kb --format json
simp-search export --kb ./kb --type procedure --limit 5
simp-resolve goal.export --kb ./kb --state state.ready=true --budget 1500
simp-resolve goal.export --kb ./kb --lang vi
simp-docs --kb ./kb --out ./site                 # site layout
simp-docs --kb ./kb --out ./graph-docs --layout graph
simp-index ./kb
```

Exit codes: `0` means success. `1` means lint found problems or the warning
threshold was exceeded. `2` means a usage, loading, or execution error.
`search`, `resolve`, and `docs` refuse to run on a KB that has lint errors.

## Library API

### `createKB(input, extensions?)`

`input` can be a directory path or a `DocSource` (`fsSource`, `memorySource`,
`gitSource`, or your own). `createKB` loads and lints the KB once, builds a
search engine, and returns a facade:

```ts
import { createKB, memorySource } from "@sontx/simplink-core";

const kb = await createKB("/path/to/kb");
kb.status; // load summary; kb.graph and kb.issues hold the snapshot
await kb.search("export records"); // { hits, goals }
const resolved = kb.resolveGoal("goal.export", {
  states: { "state.ready": true },
});
kb.resolveProcedure("procedure.export");
await kb.render(resolved, { tokenBudget: 1500, locale: "vi" });
kb.node("procedure.export");
kb.docs(); // [{ path, content }] reader-facing pages
```

The facade is a snapshot, so create it again after documents change. `isKB(x)`
recognizes a facade. The standalone functions are still available and run
synchronously: `loadDocs`, `lintKB`, `createValidator`, `createSearchIndex`,
`resolveGoal`, `resolveProcedure`, `renderResolvedGoal`, and `exportDocs`.

### Agent tools

```ts
import { createKBTools } from "@sontx/simplink-core";

const tools = await createKBTools("/path/to/kb");
tools.definitions; // JSON-schema tool definitions for your LLM
const result = await tools.call("search_kb", { query: "export records" });
```

| Tool                | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `search_kb`         | Find goals and nodes that match the user's intent                   |
| `resolve_goal`      | Build a plan for a goal with optional states, plan, and permissions |
| `resolve_procedure` | Build a plan starting from a specific procedure                     |
| `get_node`          | Read one node, with an optional body                                |
| `get_related`       | Follow edges from a node                                            |

To expose these tools over MCP, use
[`@sontx/simplink-mcp`](https://www.npmjs.com/package/@sontx/simplink-mcp).

### Git sources

```ts
import { createKB, gitSource } from "@sontx/simplink-core";

const kb = await createKB(
  gitSource("https://github.com/org/knowledge.git", {
    ref: "main",
    directory: "kb",
  }),
);
```

By default, each load makes a fresh shallow clone and removes it afterward. Pass
`checkout: "/path/to/clone"` to keep a persistent clone. Persistent clones are
never pulled, reset, or pushed automatically. Private repositories use your
existing Git credentials, and interactive prompts are disabled. Clones time out
after two minutes.

### In-process CLI runners

```ts
import { runLint, runSearch, runResolve, runDocs } from "@sontx/simplink-core";

const lines: string[] = [];
const code = await runLint(["./kb", "--format", "json"], {
  stdout: (line) => lines.push(line),
  stderr: (line) => console.error(line),
  extensions: { lint: { disable: ["W101"] } },
});
```

Runners take argument arrays and return `Promise<number>` with the same exit
codes as the CLI. They never touch `process.exitCode` or exit the host.

## Exporting docs

```ts
const pages = kb.docs(); // site layout
const graphPages = kb.docs({ layout: "graph" }); // one page per node, source paths
const vietnamese = kb.docs({ locale: "vi" });
const forBasicPlan = kb.docs({ tenant: { plan: "basic" } });
```

In **site layout** (the default), each node type gets its own section:

| Node type  | Default path                          |
| ---------- | ------------------------------------- |
| Goal       | `guides/<folders>/<name>.md`          |
| Procedure  | `guides/<folders>/how-to/<name>.md`   |
| Capability | `guides/<folders>/features/<name>.md` |
| Constraint | `reference/<folders>/<name>.md`       |
| State      | `troubleshooting/<folders>/<name>.md` |

The export adds a home page and directory indexes. If `simp.md` has a body, that
body becomes the root `index.md`. To override where a node is published, add
frontmatter:

```yaml
docs:
  path: getting-started/connect.md # lowercase kebab-case, .md; index.md is reserved
  order: 0 # smaller numbers appear first in navigation
```

Use wikilinks for internal links so they follow the publication paths. The
output is plain Markdown with relative links, and local image paths follow the
published pages. `simp-docs` copies the referenced images beside the pages at
their KB paths and skips missing ones; with `kb.docs()`, copy the files that
`docAssets(kb.graph)` lists. Engine configuration is up to you. `simp-docs`
refuses to write if the KB has lint errors, if two
pages share a route, or if the KB and output directories overlap. It
overwrites the files it generates but does not remove stale pages, so use a
fresh output directory for publishing.

**Localization:** Generated wording follows `--lang` or `locale`, then the
`language` in `simp.md`, then English. `en` and `vi` are built in. To add a
language or change the wording, use
`createKB(dir, { locales: { ja: { /* partial messages */ } } })`. Node content
and page paths are never translated.

## Extensions

To customize behavior, pass `KBExtensions` as the second argument to `createKB`,
or pass `{ extensions }` to `createKBTools`:

```ts
const kb = await createKB(
  memorySource({ "procedures/export.md": "---\n..." }),
  {
    validator: (type, data) => [], // replace bundled schema validation
    lint: { rules: [async (graph) => []], disable: ["W101"] },
    search: (graph) => myEngine, // custom SearchEngine (default: BM25 via MiniSearch)
    resolve: {
      availability: (node, tenant) => [], // [] available, null unknown, reasons otherwise
      rank: (a, b) => 0, // order alternative procedures
      tenant: {
        plan: "pro",
        permissions: ["send"],
        context: { entitlements: ["export"] },
      },
      maxDepth: 8,
    },
    renderer: async (resolved, opts) => ({
      text: resolved.goal.title,
      tokens: 1,
      omitted: [],
    }),
    tools: (defaults, kb) => defaults, // add, override, or remove agent tools
    locales: { ja: {} },
  },
);
```

| Hook           | Notes                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validator`    | Replaces schema validation. Path, type and folder, ID, duplicate, and YAML checks still run.                                                                                                     |
| `lint.rules`   | Extra `(graph) => Issue[]` checks that run after the built-in graph lint.                                                                                                                        |
| `lint.disable` | Filters warning codes. Disabling an `E*` error throws; to relax a schema, use a validator instead.                                                                                               |
| `search`       | Returns candidates. Core applies type filters, limits, relevance normalization, and goal surfacing. Helpers: `createMiniSearchEngine`, `createKBSearch`, `rankResults`, `goalsOf`.               |
| `resolve`      | Policies must be synchronous. Fetch remote data first and pass it in `tenant.context`. Defaults: `defaultAvailability`, `defaultRank`.                                                           |
| `renderer`     | Replaces plan rendering. The default renderer's `sections` hook can add, remove, or reorder sections. Helpers: `buildRenderSections`, `fitSections`, `renderPlanSteps`.                          |
| `tools`        | Returns `KBToolSpec[]`. Duplicate names are rejected. A `ToolError` message reaches the caller; other errors become internal errors. `tenantContext: false` hides plan and permission arguments. |

Custom sources implement `{ list(): SourceFile[] | Promise<SourceFile[]> }`.
Each file has a relative `/`-separated `relPath` and a `content` string. An
optional `assets(): string[] | Promise<string[]>` lists the relative paths of the
non-Markdown files, so lint can report missing images (W110). `fsSource` has it;
`memorySource` and `gitSource` don't, so those skip the check. An optional
`read(relPath): string | undefined` returns a non-Markdown text file, so lint
can check `simp-sources.yaml`. `fsSource` and `memorySource` have it;
`gitSource` doesn't.

## Related packages

| Package                                                                      | Purpose                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [`@sontx/simplink-mcp`](https://www.npmjs.com/package/@sontx/simplink-mcp)   | Serve a KB to AI agents over MCP (stdio or HTTP)                               |
| [`@sontx/simplink-node`](https://www.npmjs.com/package/@sontx/simplink-node) | Run a federated simp node and check cross-product references                   |
| [simp.sontx.dev](https://simp.sontx.dev)                                     | Browser workspace to explore, edit, and preview a KB, with no install required |

## Migrating to 0.2.0

`KBTools.call()` now returns `Promise<ToolResult>`, so add `await` to every
tool call. Upgrade `@sontx/simplink-core` and `@sontx/simplink-mcp` together.
The standalone synchronous APIs and the default CLI output have not changed.

## License

[MIT](https://github.com/sontx/simplink/blob/main/LICENSE)

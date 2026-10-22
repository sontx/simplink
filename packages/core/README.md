# @sontx/simplink-core

Load, validate, search, resolve, and render Markdown knowledge bases. ESM for Node.js 22+, with TypeScript declarations and bundled schemas. For MCP transports use `@sontx/simplink-mcp`.

## Library use

```ts
import { createKB, createKBTools, memorySource } from "@sontx/simplink-core";

const kb = await createKB("/path/to/kb");
const found = await kb.search("export records");
const resolved = kb.resolveGoal(found.goals[0].id, {
  states: { "state.ready": true },
});
const rendered = await kb.render(resolved, { tokenBudget: 1500 });
const pages = kb.docs(); // Reader-facing Markdown pages and directory indexes
const node = kb.node("procedure.export");
const tools = await createKBTools(kb);
const result = await tools.call("search_kb", { query: "export records" });
```

`createKB` loads and lints once, builds one search engine, and retains a snapshot with `graph`, `issues`, and `status`. Rebuild after changing documents or graph data; goal traversal is cached per graph. `isKB` recognizes facades using a non-enumerable `Symbol.for("simplink.kb")` brand. Sources report their name as `status.root` (default `<source>`).

Existing standalone functions remain available: `loadDocs`, `lintKB`, `createValidator`, `createSearchIndex`, `resolveGoal`, `resolveProcedure`, and `renderResolvedGoal`. Standalone search, resolution, and rendering remain synchronous. Facade search and rendering always return promises. Extension failures propagate from library methods; tools return errors and CLI runners return exit code 2.

## Code extensions

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

`gitSource(repo, options?)` accepts a Git URL or local repository path. `ref` selects a branch or tag (default: the repository's default branch); `directory` selects a relative KB folder (default: repository root). Paths and node IDs are relative to that folder. Git must be installed; private repositories use existing Git credentials or SSH configuration, with interactive credential prompts disabled. By default, each load creates a fresh shallow clone and removes it afterward, including on failure. Clone operations time out after two minutes. Clone and read errors propagate to the caller. Recreate the KB to refresh its snapshot.

Set `checkout` to a local path to keep a persistent clone: `gitSource(repo, { checkout: "/path/to/clone" })`. An absent checkout is cloned; an existing checkout must have a matching `origin`. Subsequent loads read local files, preserving uncommitted edits. `ref` applies only when the clone is created. The source name is the local KB folder, also exposed as `kb.status.root`. Persistent clones are never deleted, pulled, reset, committed, or pushed automatically; manage them with Git yourself. Watching and special handling for submodules or Git LFS are not provided.

### Other extensions

Pass `KBExtensions` as the second argument to `createKB`, or as `createKBTools(input, { extensions })` when constructing from a path or source. Supplying extensions with an already constructed KB is rejected.

- **Sources:** `fsSource(root)`, `memorySource(files, name?)`, or a `DocSource` with `list(): MaybePromise<SourceFile[]>`. Each file contains `relPath` and `content`. Paths must be relative and `/` separated, with no backslashes, empty, `.` or `..` segments, drive prefixes, or duplicates. All sources exclude non-Markdown files, hidden segments, and root documents, then sort paths before parsing. `memorySource` defaults to `<memory>`; `parseDoc` exposes the common YAML parser and its diagnostics.
- **Validation:** `validator(type, data)` returns `SchemaFinding[]` or a promise. It replaces bundled schema validation; path, type/folder, ID, duplicate-ID, and YAML checks still run. `createValidator()` and `FrontmatterValidator` remain synchronous.
- **Lint:** `lint.rules` contains synchronous or async `(graph) => Issue[]` functions run sequentially after built-in graph lint. `lint.disable` filters warning codes across all findings before counting and sorting. Disabling an `E*` error throws before loading; use a replacement validator to relax schemas. `lintKB(input, { validator, rules, disable })` exposes the same behavior directly.
- **Search:** `search(graph)` returns a `SearchEngine` or promise. Its `search(query, opts)` returns `SearchMatch[]` or a promise. Core discards unknown IDs and nonpositive/nonfinite scores, keeps the highest score per ID (first on ties), sorts scores stably, and supplies `{}` for missing `matched`. Core applies deprecation/type filters, relevance normalization, limits, and goal aggregation. Hit relevance uses the best hit after type filtering; goal relevance uses the best eligible match before type filtering. Raw scores are engine-specific; the default uses BM25. Blank queries skip retrieval. Engines receive only `fuzzy`, `prefix`, and `includeDeprecated` (the interface also permits a `candidateLimit` hint), never `types`, `limit`, `goalLimit`, or `minRelevance`. Return enough candidates for filtering and goal surfacing. `createKBSearch`, `rankResults`, and `goalsOf` expose shared processing. `createMiniSearchEngine(graph, { stopwords, fold, boosts })` is synchronous; stopwords use the selected folding function and boosts merge over `FIELD_BOOST`. `createSearchIndex(graph, opts?)` uses the same default engine synchronously.
- **Resolution:** `resolve.availability(node, tenant)` returns `[]` for available, `null` for unknown, or reasons for unavailable. It controls both final summaries and required/optional satisfier selection. `defaultAvailability` retains plan/permission checks. `resolve.rank(a, b)` compares `RankedCandidate` alternatives; returning zero preserves declaration order, and internal `order` is omitted from results. `defaultRank` orders by availability, deprecation, preparation, plan length, then declaration order. Policies and comparators must be synchronous. Fetch remote data first and pass it in `tenant.context`. Defaults support `maxDepth` and `tenant` too. Defined per-call options replace defaults; tenant `plan`, `permissions`, and `context` merge by defined field, with whole fields replaced, not deep merged. Omitted or `undefined` values preserve defaults.
- **Rendering:** `renderer(resolved, opts)` returns `RenderResult` or a promise. The default `renderResolvedGoal` is synchronous. Its `RenderOptions.sections(defaults, resolved)` hook runs once to add/remove/reorder sections before budgeting. `buildRenderSections`, `fitSections`, and `renderPlanSteps` enable composition. Priority-zero sections always remain, even above budget. Custom renderers receive options but may ignore the sections hook.
- **Tools:** `tools(defaults, kb)` in `KBToolsOptions` synchronously returns `KBToolSpec[]` to add, override, or remove tools. Each spec has a `definition` and a synchronous or async `handler(args, kb)`. `defaultToolSpecs` and `buildDefinitions` return independent copies. Duplicate names are rejected, schemas validate arguments and apply defaults, and thrown/rejected `ToolError` messages pass through. Other exceptions become internal tool errors. `tenantContext: false` hides public plan/permission arguments; configured tenant defaults still apply. Application `tenant.context` is never exposed in tool schemas. Missing-node suggestions use the configured search engine.

```ts
const custom = await createKB(
  memorySource({
    "procedures/export.md":
      "---\ntype: procedure\ntitle: Export\nsummary: Export records\n---\n## Steps\n1. Export records\n",
  }),
  {
    lint: { rules: [async () => []], disable: ["W101"] },
    resolve: { tenant: { context: { entitlements: ["export"] } } },
    renderer: async (resolved) => ({
      text: resolved.goal.title,
      tokens: 1,
      omitted: [],
    }),
  },
);
```

## CLI and in-process runners

`simp` bundles every command (`lint`, `search`, `resolve`, `docs`, `index`). On an interactive terminal it prompts for missing arguments (command, query, goal, output directory) and shows progress; piped or in CI it prints plain output. The single-purpose bins `simp-lint`, `simp-search`, `simp-resolve`, `simp-docs`, and `simp-index` remain; each supports `--help`.

```sh
simp                      # pick a command interactively
simp resolve --kb ./kb    # pick a goal from the KB
simp lint ./kb --max-warnings 0
```

```sh
simp-lint ./kb --format json
simp-search export --kb ./kb --type procedure --limit 5
simp-resolve goal.export --kb ./kb --state state.ready=true --budget 1500
simp-docs --kb ./kb --out ./site
simp-docs --kb ./kb --out ./graph-docs --layout graph
```

```ts
import { runLint, runSearch, runResolve } from "@sontx/simplink-core";
const lines: string[] = [];
const code = await runLint(["./kb", "--format", "json"], {
  stdout: (line) => lines.push(line),
  stderr: (line) => console.error(line),
  extensions: { lint: { disable: ["W101"] } },
});
```

Runners take explicit argument arrays, return `Promise<number>`, and never change `process.exitCode` or terminate the host. Importing them performs no parsing or output. Callbacks receive line-oriented messages with no newline appended (a message can itself contain multiline JSON or Markdown); defaults are `console.log`/`console.error`. `runLint` applies validator/lint extensions; search and resolve use all facade extensions. Success returns 0; lint findings or the warning threshold return 1 in the linter; argument/loading/execution failures return 2 with stderr diagnostics. Search/resolve reject KBs with lint errors with code 2. Numeric limits/budgets must be positive finite integers; `max-warnings` must be -1 or nonnegative.

`exportDocs(graph, opts?: DocsOptions)` and `kb.docs(opts?)` return `{ path, content }[]`
without writing files. Site layout is the default: goals and supporting how-tos
appear under `guides/`, constraints under `reference/`, and state checks under
`troubleshooting/`, with a home page and directory indexes. `layout: "graph"`
retains source paths and graph headings. `DocsOptions` also accepts resolve options;
the facade merges its configured resolve defaults. Exports have no token-budget trimming.

Optional node frontmatter `docs: { path: getting-started/connect.md, order: 0 }`
controls publication paths and navigation order. Paths use lowercase kebab-case
POSIX segments and a `.md` suffix; `index.md` is reserved for generated indexes.
Order is a nonnegative integer. Node IDs and source paths do not change. Use
wikilinks for internal KB links so relative links follow the chosen output paths.

`runDocs` is the importable CLI runner. It passes extensions through the facade,
rejects lint errors, duplicate routes, overlapping KB/output trees, escaping
symlinks and hardlinked destinations before writing. Existing generated files
are overwritten, unrelated files are preserved, and removed pages are not cleaned
up. Write failures return 2 and can leave a partial export. Exported availability
is recommendation context, not access control. Engine configuration, assets,
and authored MDX/HTML compatibility remain the consuming site's responsibility.

## Migrating to 0.2.0

`KBTools.call()` now returns `Promise<ToolResult>`: add `await` to every tool call. Release core and MCP together; MCP awaits handlers and advertises version `0.2.0`. Standalone synchronous APIs and default valid CLI output remain compatible.

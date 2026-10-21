# Simplink

A pnpm workspace for Markdown knowledge bases: schema validation, graphs,
resolution, search, and MCP access. Requires Node.js 20+ and pnpm 12.14.0.

## Packages

| Package                | Purpose                                                                      | Commands                                                |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------- |
| `@sontx/simplink-core` | Loading, schemas, linting, resolution, search, provider independent KB tools | `simp-lint`, `simp-resolve`, `simp-search`, `simp-docs` |
| `@sontx/simplink-mcp`  | MCP server with stdio and HTTP transports; depends on core                   | `simp-mcp`, `simp-mcp-http`                             |

All packages are ESM and include TypeScript declarations. Core includes the JSON
schemas and has no dependency on the MCP SDK.

```ts
import { createKBTools, lintKB } from "@sontx/simplink-core";
import { createMcpServer, createMcpHttpHandler } from "@sontx/simplink-mcp";

const tools = await createKBTools("/path/to/kb");
const server = createMcpServer(tools);
// Connect server to an MCP transport, or use createMcpHttpHandler(tools)
// with Node's http.createServer.
```

## Development

```sh
pnpm install
pnpm lint
pnpm build
pnpm test
```

Builds run in dependency order. The root test command builds first, then runs all
package suites, including the compiled stdio server integration. Tests use the
synthetic KB in `test/fixtures/kb`; no local knowledge base is required.

`pnpm lint` checks JavaScript and TypeScript with ESLint. Run `pnpm lint:fix`
to apply automatic fixes. Prettier handles formatting via `pnpm format`.

After building, run a package suite with
`pnpm --filter @sontx/simplink-core test` or
`pnpm --filter @sontx/simplink-mcp test`.

Root `kb/` holds Simplink's own knowledge base, which describes how to use
these packages. `pnpm dev`, `pnpm lint:kb`, and `pnpm start:http` use it by
default; `kb/INVENTORY.md` tracks its coverage. To use another directory:

```sh
pnpm exec tsx packages/core/src/cli.ts /path/to/kb
node packages/core/dist/resolve-cli.js goal.example --kb /path/to/kb
node packages/mcp/dist/bin.js --kb /path/to/kb
node packages/mcp/dist/http-bin.js --kb /path/to/kb --port 3000
```

The Docker image serves HTTP on port 3000 and checks `/healthz`. The image includes
root `kb/`; replace it before `docker build -t simplink .` to serve another KB, or mount a replacement at `/app/kb`
and restart the container to reload it.

## Local KB manager

The UI is a static browser app. Build it and start the preview server:

```sh
pnpm build
pnpm ui
# Development:
pnpm dev:ui
```

Open the URL printed by Vite, select **Open KB folder**, and choose a local KB.
Browse Graph, Nodes, Issues, Docs, and search; edit Markdown, create or delete
nodes, and manage relationships. All KB operations run in the browser.

Chromium browsers save directly to the selected folder. The browser remembers
its handle when IndexedDB is available; after refreshing, **Reopen <name>** asks
for read/write permission again. Reload picks up external edits.

Other browsers load a memory copy. The banner **Changes saved in memory — download
to keep them** includes **Download KB (.zip)**, which preserves Markdown edits and
unchanged assets. Reload keeps memory edits; closing, switching folders, or
refreshing guards against losing them. Download before leaving. Dot-files and
dot-folders such as `.git` are excluded in both modes. Git URLs are unsupported;
clone repositories yourself and open the local folder.

For static hosting, deploy `packages/ui/dist/`. Use HTTPS or localhost for browser
folder access. To host under a subpath, build with `SIMPLINK_UI_BASE=/sub/` (set
that environment variable using your shell). Routes use browser history and
Markdown anchors use the hash. The build copies `index.html` to `404.html` for
hosts such as GitHub Pages; other hosts need a rewrite to `index.html` for SPA
routes. Vite preview already provides that fallback.

Run `pnpm --filter @sontx/simplink-ui test:browser` for the separate Chrome/Edge
smoke test against Vite dev and a production build hosted under `/sub/`.

## Export Markdown docs

Export a reader-facing Markdown site with a home page, directory landing pages,
and relative `.md` links. Tasks become guides, constraints become reference
pages, and states become troubleshooting checks. Goal guides include the full
walkthrough, choices, restrictions, and resolver warnings. Authored code examples
stay literal.

```ts
import { createKB, exportDocs } from "@sontx/simplink-core";

const kb = await createKB("/path/to/kb", {
  resolve: { tenant: { plan: "pro", permissions: ["send"] }, maxDepth: 8 },
});
const pages = exportDocs(kb.graph); // Pure: returns { path, content }[]
const tenantPages = kb.docs(); // Uses the configured resolve defaults
const otherPages = kb.docs({ tenant: { plan: "basic" } });
const graphPages = kb.docs({ layout: "graph" }); // Original source paths and graph headings
```

```sh
simp-docs --kb test/fixtures/kb --out /path/to/scratch/docs
# From this checkout after pnpm build:
node packages/core/dist/docs-cli.js --kb test/fixtures/kb --out /path/to/scratch/docs
# Keep the original one-page-per-node structure:
simp-docs --kb test/fixtures/kb --out /path/to/scratch/graph --layout graph
```

Site layout is the default for `exportDocs`, `kb.docs()`, and `simp-docs`.
Default locations preserve the product folders under each node type:

| Node type  | Default publication path              |
| ---------- | ------------------------------------- |
| Goal       | `guides/<folders>/<name>.md`          |
| Procedure  | `guides/<folders>/how-to/<name>.md`   |
| Capability | `guides/<folders>/features/<name>.md` |
| Constraint | `reference/<folders>/<name>.md`       |
| State      | `troubleshooting/<folders>/<name>.md` |

Use optional frontmatter to choose a more specific location, such as onboarding:

```yaml
docs:
  path: getting-started/connect-zalo.md
  order: 0
```

`docs.path` is a relative POSIX `.md` path with lowercase kebab-case segments.
It changes publication only; the source path and node ID stay unchanged.
`docs.order` is a nonnegative integer; smaller numbers appear first in navigation.
Folders use their earliest descendant's order. Unordered entries follow ordered
entries, with task pages first and graph order breaking ties. `index.md` is reserved
for generated landing pages; duplicate destinations are rejected before writing.
A source named `index.md` defaults to `overview.md` in site layout.
Use wikilinks for internal KB links so they follow publication paths.
Graph layout ignores publication metadata and generates no landing pages.

`--out` is required. The KB and output directories must be disjoint, including
symlink aliases. The CLI rejects lint errors and checks destinations before
writing. Hardlinked output files are rejected to prevent overwriting aliased
source content. Existing generated paths are overwritten; unrelated files are preserved.
Removed or renamed nodes leave stale exported files, so use a fresh dedicated
output directory for publishing. A write error can leave a partial export;
the command returns exit code 2 and is safe to rerun.

The output is plain Markdown, with no engine configuration or asset copying.
Raw authored MDX/HTML and heading-slug conventions remain the consuming
engine's responsibility. Explicit heading fragments are retained. Availability
options affect recommendations; they do not filter exported pages or provide
access control.

## Migration

The former `@sontx/simplink` package is replaced by these two packages; no
compatibility package is provided. Move core imports to `@sontx/simplink-core`
and MCP imports to `@sontx/simplink-mcp`. The public functions, tool definitions,
CLI names, arguments, and MCP server identity retain their existing behavior.

Source and compiled entry points now live under their owning package. Each
package publishes its own `dist/`, license, and declarations; core also publishes
`schemas/`. Nothing is published from the private root.

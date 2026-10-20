# Simplink

A pnpm workspace for Markdown knowledge bases: schema validation, graphs,
resolution, search, and MCP access. Requires Node.js 20+ and pnpm 12.14.0.

## Packages

| Package                | Purpose                                                                      | Commands                                   |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| `@sontx/simplink-core` | Loading, schemas, linting, resolution, search, provider independent KB tools | `simp-lint`, `simp-resolve`, `simp-search` |
| `@sontx/simplink-mcp`  | MCP server with stdio and HTTP transports; depends on core                   | `simp-mcp`, `simp-mcp-http`                |

Both packages are ESM and include TypeScript declarations. Core includes the JSON
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

Builds run in dependency order. The root test command builds first, then runs both
package suites, including the compiled stdio server integration. Tests use the
synthetic KB in `test/fixtures/kb`; no local knowledge base is required.

`pnpm lint` checks JavaScript and TypeScript with ESLint. Run `pnpm lint:fix`
to apply automatic fixes. Prettier handles formatting via `pnpm format`.

After building, run a package suite with
`pnpm --filter @sontx/simplink-core test` or
`pnpm --filter @sontx/simplink-mcp test`.

Provide an ignored root `kb/` directory for `pnpm dev`, `pnpm lint:kb`, and
`pnpm start:http`. To use another directory:

```sh
pnpm exec tsx packages/core/src/cli.ts /path/to/kb
node packages/core/dist/resolve-cli.js goal.example --kb /path/to/kb
node packages/mcp/dist/bin.js --kb /path/to/kb
node packages/mcp/dist/http-bin.js --kb /path/to/kb --port 3000
```

The Docker image serves HTTP on port 3000 and checks `/healthz`. Place your KB at
root `kb/` before `docker build -t simplink .`; mount a replacement at `/app/kb`
and restart the container to reload it.

## Migration

The former `@sontx/simplink` package is replaced by these two packages; no
compatibility package is provided. Move core imports to `@sontx/simplink-core`
and MCP imports to `@sontx/simplink-mcp`. The public functions, tool definitions,
CLI names, arguments, and MCP server identity retain their existing behavior.

Source and compiled entry points now live under their owning package. Each
package publishes its own `dist/`, license, and declarations; core also publishes
`schemas/`. Nothing is published from the private root.

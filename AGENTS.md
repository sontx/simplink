# Repository Guidelines

## Project Structure & Module Organization

This pnpm monorepo contains `@sontx/simplink-core`, `@sontx/simplink-mcp`, and `@sontx/simplink-ui`. The repository root is private.

- `packages/core/src/`: Loading, schemas, graphs, linting, resolution, rendering, search, and core CLI entry points; `index.ts` defines public exports.
- `packages/core/src/source.ts`: Filesystem and in-memory document sources.
- `packages/core/src/kb.ts`: Loaded KB facade and code-configured extensions.
- `packages/core/src/cli/`: Importable CLI runners and output context; bin wrappers remain in `src/`.
- `packages/core/src/tools/core.ts`: Provider independent knowledge-base tool definitions and execution.
- `packages/core/schemas/`: Bundled JSON schemas for knowledge-base document types.
- `packages/mcp/src/`: MCP server, HTTP transport, executable entry points, and public `index.ts`. Import core through `@sontx/simplink-core`, never across package source directories.
- `packages/ui/src/`: Static Vite React SPA with browser folder access, workspace services, graph management, and in-memory docs preview; no UI backend.
- `packages/*/test/`: Package-owned tests; core fixture builders live in `packages/core/test/helpers.ts`.
- `test/fixtures/kb/`: Shared synthetic knowledge base; tests must not depend on root `kb/`.
- `kb/`: Simplink's own product knowledge base; `kb/INVENTORY.md` tracks coverage. Run `pnpm lint:kb` after changing it or the features it documents.
- `packages/*/dist/`: Generated JavaScript and declarations; change source files instead.

## Build, Test, and Development Commands

Use Node.js 20 or newer and the package-manager version declared in `package.json` (`pnpm@12.14.0`).

- `pnpm install`: Install dependencies using `pnpm-lock.yaml`.
- `pnpm build`: Build both packages and declarations in dependency order.
- `pnpm lint`: Check JavaScript and TypeScript with ESLint (`pnpm lint:fix` applies automatic fixes).
- `pnpm test`: Build both packages, then run their suites through `tsx` and Node's test runner.
- `pnpm dev`: Run the lint CLI directly from source against `kb/`.
- `pnpm lint:kb`: Run the compiled knowledge-base linter against `kb/`.
- `pnpm start:http`: Start the compiled MCP HTTP server using `kb/`.
- `pnpm ui`: Preview the built static UI; choose a KB folder in the browser.
- `pnpm dev:ui`: Start the Vite UI development server.
- `pnpm --filter @sontx/simplink-ui test:browser`: Run the Chrome/Edge browser smoke test against dev and production under `/sub/`.

Core and MCP runtime commands default to root `kb/`, the checked-in Simplink KB. Tests use checked-in fixtures. To lint another directory, use `pnpm exec tsx packages/core/src/cli.ts <path>`.

## Coding Style & Naming Conventions

Follow existing TypeScript: two-space indentation, double quotes, semicolons, strict types, and camelCase functions and variables. Use PascalCase for types and interfaces. Keep modules focused and use descriptive kebab-case filenames for multiword modules. This is an ESM package with NodeNext resolution: use `.js` suffixes in relative TypeScript imports. ESLint checks source code, Prettier handles formatting, and `lint:kb` validates knowledge-base content.

## Testing Guidelines

Use `node:test` and `node:assert/strict`. Name tests `packages/<package>/test/<feature>.test.ts` and describe observable behavior in test titles. Reuse core's `test/helpers.ts` for temporary Markdown fixtures. Resolve shared fixtures and subprocess scripts relative to test files. Cover relevant schema, graph, CLI, or transport behavior when changing those areas. Run `pnpm test` and `pnpm build` before submitting. After building, run an individual suite using `pnpm --filter @sontx/simplink-core test` or `pnpm --filter @sontx/simplink-mcp test`. No coverage threshold is configured.

## Commit & Pull Request Guidelines

The short Git history uses concise imperative subjects, such as `Rename kb command prefixes to simp`; no formal commit convention is established. Keep commits focused. Pull requests should explain the problem, resulting behavior, and validation performed. Link relevant issues and include CLI examples or protocol details when changing public interfaces.

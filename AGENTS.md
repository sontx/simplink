# Repository Guidelines

## Project Structure & Module Organization

This package (`@sontx/simplink`) loads Markdown knowledge bases, validates document schemas, builds graphs, and exposes linting, resolution, search, and MCP interfaces.

- `src/`: TypeScript implementation; `index.ts` defines the public exports. CLI entry points use `*-cli.ts`, with linting in `cli.ts`.
- `src/tools/core.ts`: Shared knowledge-base tool definitions and execution.
- `src/mcp/`: MCP server, HTTP transport, and executable entry points.
- `schemas/`: JSON schemas for knowledge-base document types.
- `test/`: Automated tests and shared fixture builders in `helpers.ts`.
- `dist/`: Generated JavaScript and declarations; change source files instead.

## Build, Test, and Development Commands

Use Node.js 20 or newer and the package-manager version declared in `package.json` (`pnpm@12.14.0`).

- `pnpm install`: Install dependencies using `pnpm-lock.yaml`.
- `pnpm build`: Compile TypeScript and emit declarations into `dist/`.
- `pnpm test`: Run all `test/*.test.ts` files through `tsx` and Node's test runner.
- `pnpm dev`: Run the lint CLI directly from source against `kb/`.
- `pnpm lint:kb`: Run the compiled knowledge-base linter against `kb/`.
- `pnpm start:http`: Start the compiled MCP HTTP server using `kb/`.

The repository does not include `kb/`; provide a knowledge base for those commands. To lint another directory, use `pnpm exec tsx src/cli.ts <path>`.

## Coding Style & Naming Conventions

Follow existing TypeScript: two-space indentation, double quotes, semicolons, strict types, and camelCase functions and variables. Use PascalCase for types and interfaces. Keep modules focused and use descriptive kebab-case filenames for multiword modules. This is an ESM package with NodeNext resolution: use `.js` suffixes in relative TypeScript imports. No dedicated formatter or source-code linter is configured; `lint:kb` validates knowledge-base content.

## Testing Guidelines

Use `node:test` and `node:assert/strict`. Name tests `test/<feature>.test.ts` and describe observable behavior in test titles. Reuse `test/helpers.ts` for temporary Markdown fixtures. Cover relevant schema, graph, CLI, or transport behavior when changing those areas. Run `pnpm test` and `pnpm build` before submitting. No coverage threshold is configured.

## Commit & Pull Request Guidelines

The short Git history uses concise imperative subjects, such as `Rename kb command prefixes to simp`; no formal commit convention is established. Keep commits focused. Pull requests should explain the problem, resulting behavior, and validation performed. Link relevant issues and include CLI examples or protocol details when changing public interfaces.

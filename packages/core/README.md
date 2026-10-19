# @sontx/simplink-core

Load Markdown knowledge bases, validate schemas, build graphs, lint documents,
resolve goals and procedures, render plans, search, and serve provider independent
KB tools. ESM for Node.js 20+, with TypeScript declarations and bundled schemas.

```ts
import { createKBTools, lintKB } from "@sontx/simplink-core";

const result = await lintKB("/path/to/kb");
const tools = await createKBTools("/path/to/kb");
const matches = tools.call("search_kb", { query: "export records" });
```

Includes `simp-lint`, `simp-resolve`, and `simp-search`; each supports `--help`.
For MCP transports, use `@sontx/simplink-mcp`.

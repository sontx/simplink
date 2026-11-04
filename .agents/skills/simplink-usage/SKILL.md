---
name: simplink-usage
description: Use Simplink packages (@sontx/simplink-core, @sontx/simplink-mcp, @sontx/simplink-node) from the command line or from TypeScript/JavaScript code — lint, search, and resolve a Markdown knowledge base, export docs, serve it to AI agents over MCP, run a federated simp node, or embed KB tools in an app or chatbot. Use this whenever the user wants to query, validate, serve, embed, integrate, or automate a kb-graph / Simplink knowledge base, wire it into an agent, MCP client, CI, or backend — even if they only say "simp", "simp-lint", "kb tools", or "connect the KB to Claude". To write KB content, use product-kb-builder or docs-kb-builder instead.
---

# Using Simplink

Simplink turns a folder of Markdown nodes (goals, procedures, capabilities, states, constraints) into
a graph an agent can search and resolve into step-by-step plans. Pick the package by job:

| Package                | Job                                                   | Commands                                                                            |
| ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `@sontx/simplink-core` | Load, lint, search, resolve, render, export docs      | `simp`, `simp-lint`, `simp-search`, `simp-resolve`, `simp-docs`, `simp-index`       |
| `@sontx/simplink-mcp`  | Serve KB tools to agents over MCP (stdio or HTTP)     | `simp-mcp`, `simp-mcp-http`                                                         |
| `@sontx/simplink-node` | Serve a KB to other KBs (federation), check peer refs | `simp-node`                                                                         |

All packages are ESM, need Node.js 22+, and ship TypeScript declarations. Every command supports
`--help`; run it before guessing a flag, since this skill may lag behind the installed version.

Decide the mode first:

- **CLI** — one-off checks, CI, scripts, serving to an agent. Install: `npm i -D @sontx/simplink-core`
  (plus `@sontx/simplink-mcp` / `@sontx/simplink-node` as needed), then `npx <command>`.
- **Library** — app code, custom tools, chatbots, tests. Same packages, imported.

## CLI

### Core

```sh
npx simp                                          # interactive: pick a command, query, goal
npx simp-lint kb                                  # exit 1 on errors
npx simp-lint kb --format json --max-warnings 0   # CI gate
npx simp-search "export records" --kb kb --type goal --limit 5
npx simp-resolve goal.area.task --kb kb --state state.ready=true --plan pro --budget 1500
npx simp-resolve goal.area.task --kb kb --choice method=api --format json
npx simp-docs --kb kb --out ./site                # reader-facing Markdown site
npx simp-docs --kb kb --out ./graph --layout graph
npx simp-docs --kb kb --out ./site-vi --lang vi   # generated wording in Vietnamese (en, vi built in)
npx simp-index kb                                 # write simp-index.yaml for static hosting
```

Exit codes: `0` ok, `1` lint findings (or warnings over `--max-warnings`), `2` bad arguments, load
failure, or a KB with lint errors (search/resolve/docs refuse those). Fix lint first.

`simp-docs --out` must not overlap the KB folder; it overwrites generated files and never deletes
stale ones, so use a fresh output folder for publishing.

### MCP (give the KB to an agent)

```sh
npx -p @sontx/simplink-mcp simp-mcp --kb ./kb                          # stdio
npx -p @sontx/simplink-mcp simp-mcp-http --kb ./kb --port 3000         # HTTP: /mcp and /healthz
npx -p @sontx/simplink-mcp simp-mcp --simp http://127.0.0.1:3393/simp  # use a simp node instead of --kb
```

MCP client config (Claude Code `.mcp.json`, Claude Desktop, Cursor, and similar use this shape):

```json
{
  "mcpServers": {
    "kb": {
      "command": "npx",
      "args": ["-y", "-p", "@sontx/simplink-mcp", "simp-mcp", "--kb", "/abs/path/to/kb"]
    }
  }
}
```

Tools exposed: `search_kb`, `resolve_goal`, `resolve_procedure`, `get_node`, `get_related`.
`simp-mcp-http` has **no authentication** and binds `127.0.0.1` by default; put it behind a gateway
before exposing it, and set `--allowed-host` / `--allowed-origin`.

### simp node (federation)

A KB with a root `simp.md` can declare peers and reference their nodes as `simp://peer/goal.x`.

```sh
npx simp-node serve --kb kb --port 3393 --token "$SIMP_TOKEN"   # peer API at http://127.0.0.1:3393/simp
npx simp-node serve --kb kb --allowed-origin https://ui.example  # let a browser UI connect
npx simp-node lint kb --peers                                     # check remote refs against live peers
npx simp-node serve --kb kb --peer crm=https://crm.example/simp --peer-token crm=TOKEN
```

Tokens: pass through env vars (`SIMP_TOKEN`), never commit them.

## Library

### Load, search, resolve, render

```ts
import { createKB } from "@sontx/simplink-core";

const kb = await createKB("kb"); // loads + lints once; check kb.status.errors
if (kb.status.errors) console.error(kb.issues);

const found = await kb.search("export records"); // { query, hits, goals }
const plan = kb.resolveGoal(found.goals[0].id, {
  states: { "state.ready": true },
  tenant: { plan: "pro", permissions: ["send"] },
});
const { text } = await kb.render(plan, { tokenBudget: 1500 }); // Markdown plan
const node = kb.node("procedure.area.task");
const pages = kb.docs(); // [{ path, content }], writes nothing
```

`createKB` takes a path or a source: `fsSource(dir)`, `memorySource({ "goals/x.md": "..." })`, or
`gitSource(repoUrl, { ref: "main", directory: "kb" })`. The KB is a snapshot — call `createKB` again
after files change.

### Agent tools without MCP (any LLM SDK)

```ts
import { createKBTools } from "@sontx/simplink-core";

const tools = await createKBTools("kb"); // or an existing KB / FederatedKB
tools.definitions; // [{ name, description, inputSchema }] → pass to your LLM's tool list
const result = await tools.call("search_kb", { query: "export records" }); // { content, isError? }
```

Map each LLM tool call to `await tools.call(name, args)` and return `result.content` to the model.
Arguments are validated against the schemas; errors come back as results, not throws.

### MCP server in code

```ts
import { createServer } from "node:http";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpServer, createMcpHttpHandler } from "@sontx/simplink-mcp";

const tools = await createKBTools("kb");
createServer(createMcpHttpHandler(tools)).listen(3000, "127.0.0.1"); // HTTP
const server = createMcpServer(tools); // or connect to any MCP SDK transport
```

### Run CLI commands in-process

```ts
import { runLint } from "@sontx/simplink-core";

const lines: string[] = [];
const code = await runLint(["kb", "--format", "json"], { stdout: (l) => lines.push(l) });
```

`runLint`, `runSearch`, `runResolve`, `runDocs`, `runIndex`, `runSimp` take the CLI's argument array,
return the exit code, and never touch `process.exit`.

### Federation in code

```ts
import { createFederatedKB, createKB, createKBTools } from "@sontx/simplink-core";
import { startSimpNode, httpPeer, openPeer } from "@sontx/simplink-node";

const node = await startSimpNode({ kb: "kb", port: 0 }); // node.url, node.close()
const fed = await createFederatedKB({
  local: await createKB("kb"),
  peers: [httpPeer("https://crm.example/simp", { token: process.env.CRM_TOKEN })],
});
// or { home: httpPeer(url) } to use a remote node for everything; openPeer(url) also accepts static sites and folders
const tools = await createKBTools(fed); // remote IDs are qualified: "crm:goal.x"
```

### Customize

`createKB(input, extensions)` accepts `lint: { rules, disable }`, `validator`, `search`,
`resolve: { availability, rank, tenant, maxDepth }`, `renderer`, and `tools` (add/override/remove
tool specs). Read the declarations (`node_modules/@sontx/simplink-core/dist/kb.d.ts`) or the package
README for exact signatures before writing an extension.

## Gotchas

- Search/resolve/docs reject KBs with lint errors — run `simp-lint` first and fix every error.
- `KBTools.call()` is async since 0.2.0; always `await` it.
- `--state id=true` and `--choice [procId:]choiceId=key` change the resolved plan; offer them when a
  plan asks the user a question.
- `tenant.plan` / `permissions` affect recommendations only; they are not access control.
- Never put secrets (peer tokens, API keys) into KB files or command lines committed to the repo.

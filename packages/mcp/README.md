# @sontx/simplink-mcp

[![npm version](https://img.shields.io/npm/v/@sontx/simplink-mcp.svg)](https://www.npmjs.com/package/@sontx/simplink-mcp)
[![node](https://img.shields.io/node/v/@sontx/simplink-mcp.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@sontx/simplink-mcp.svg)](https://github.com/sontx/simplink/blob/main/LICENSE)

> Give AI agents your product knowledge over the Model Context Protocol (MCP).

This package serves a [Simplink](https://www.npmjs.com/package/@sontx/simplink-core)
knowledge base to MCP clients such as Claude Desktop, Claude Code, Cursor, and
other agents. It supports stdio and stateless Streamable HTTP. Agents can
search the KB for the user's goal and resolve it into a step-by-step plan that
accounts for their account plan, permissions, and current state.

**Explore a KB first:** [simp.sontx.dev](https://simp.sontx.dev) lets you open a
KB folder or connect to a simp node. You can browse the graph, try searches in
the Playground, and preview the plans agents will receive before you wire it
up.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Key terms](#key-terms)
- [Tools exposed to agents](#tools-exposed-to-agents)
- [CLI](#cli)
- [Library API](#library-api)
- [Related packages](#related-packages)
- [License](#license)

## Install

```sh
npm install -g @sontx/simplink-mcp
# or run on demand
npx -p @sontx/simplink-mcp simp-mcp --kb ./kb
```

Requires Node.js 22 or newer. Installing this package also installs
`@sontx/simplink-core` and `@sontx/simplink-node`.

## Quick start

### Claude Code

```sh
claude mcp add simplink -- npx -y -p @sontx/simplink-mcp simp-mcp --kb /abs/path/to/kb
```

### Any MCP client (JSON config)

```json
{
  "mcpServers": {
    "simplink": {
      "command": "npx",
      "args": [
        "-y",
        "-p",
        "@sontx/simplink-mcp",
        "simp-mcp",
        "--kb",
        "/abs/path/to/kb"
      ]
    }
  }
}
```

### Over HTTP

```sh
simp-mcp-http --kb ./kb --port 3000
# MCP endpoint: http://127.0.0.1:3000/mcp   health: /healthz
```

### Connect to a remote KB instead of a local folder

```sh
simp-mcp --simp https://kb.example.com/simp --simp-token "$TOKEN"
```

`--simp` accepts a running simp node, a statically hosted KB, or a local folder.

## Key terms

| Term           | Meaning                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **KB**         | A folder of Markdown files that form a typed graph. Each file is a **node**.                                                |
| **goal**       | What the user wants to achieve. It is the entry point for search and planning.                                              |
| **procedure**  | A concrete how-to with steps, prerequisites, and choices.                                                                   |
| **capability** | A product feature that procedures use.                                                                                      |
| **state**      | A condition such as "channel connected" that procedures need or produce.                                                    |
| **constraint** | A rule or limit that applies to procedures and capabilities.                                                                |
| **plan**       | The ordered steps that resolving a goal produces, including prerequisites, constraints, choices, and availability warnings. |
| **tenant**     | Who is asking: their account `plan` and `permissions`. The resolver uses the tenant to prefer available options.            |
| **simp**       | A KB identified by the `name` in its root `simp.md`. That file also declares the KB's **peers**.                            |
| **peer**       | Another product's simp. Searches can include its nodes, and plans can use them through qualified IDs such as `crm:goal.x`.  |
| **simp node**  | An HTTP server that serves a KB to peers. See [`@sontx/simplink-node`](https://www.npmjs.com/package/@sontx/simplink-node). |

For the full model, including node IDs, edges, and serving modes, see
[Concepts and terms](https://www.npmjs.com/package/@sontx/simplink-core#concepts-and-terms)
in the core README.

## Tools exposed to agents

| Tool                | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `search_kb`         | Find goals and nodes that match the user's intent, written in their own words |
| `resolve_goal`      | Build a plan for a goal from known states, a tenant plan, and permissions     |
| `resolve_procedure` | Build a plan starting from a specific procedure                               |
| `get_node`          | Read one node, with an optional body                                          |
| `get_related`       | Follow a node's edges, optionally filtered by edge kind                       |

The server also sends `SERVER_INSTRUCTIONS`, which tell the agent to search
first, resolve the best goal, and review warnings before acting. When peers are
configured, results can include qualified IDs from other products. Pass those
IDs unchanged to later tool calls.

## CLI

### `simp-mcp` (stdio)

| Flag                        | Default             | Description                                                   |
| --------------------------- | ------------------- | ------------------------------------------------------------- |
| `--kb <dir>`                | `$KB_DIR` or `kb`   | Local KB directory                                            |
| `--simp <url>`              |                     | Use a simp node, static KB, or folder (exclusive with `--kb`) |
| `--simp-token <token>`      |                     | Bearer token for `--simp`                                     |
| `--no-peers`                |                     | Ignore peers declared in `simp.md`                            |
| `--peer <name=url>`         | URLs from `simp.md` | Override a peer URL (repeatable)                              |
| `--peer-token <name=token>` |                     | Token for a peer (repeatable)                                 |
| `--peer-timeout <ms>`       | `2000`              | Peer request timeout                                          |

### `simp-mcp-http` (Streamable HTTP)

`simp-mcp-http` accepts every flag above, plus:

| Flag                        | Env               | Default     |
| --------------------------- | ----------------- | ----------- |
| `--host <host>`             | `HOST`            | `127.0.0.1` |
| `--port <n>`                | `PORT`            | `3000`      |
| `--path <path>`             | `MCP_PATH`        | `/mcp`      |
| `--max-body <bytes>`        | `MAX_BODY_BYTES`  | `1000000`   |
| `--allowed-host <host>`     | `ALLOWED_HOSTS`   | any         |
| `--allowed-origin <origin>` | `ALLOWED_ORIGINS` | none        |

The HTTP server is stateless and exposes the MCP endpoint and `/healthz`. It
hides tenant arguments from tools, so remote callers cannot claim a plan or
permissions. It does not authenticate requests, so put it behind a gateway that
does.

## Library API

```ts
import { createServer } from "node:http";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpServer, createMcpHttpHandler } from "@sontx/simplink-mcp";

const tools = await createKBTools("/path/to/kb");

// HTTP: mount the handler in any Node server
createServer(createMcpHttpHandler(tools)).listen(3000, "127.0.0.1");

// Or connect to any MCP SDK transport
const server = createMcpServer(tools);
```

`createKBTools` accepts core extensions such as a custom search engine, an
availability policy, or extra tools, and the MCP server exposes whatever it
produces. The package also exports `SERVER_INSTRUCTIONS`, `McpHttpOptions`, and
`RequestLog`.

## Related packages

| Package                                                                      | Purpose                                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [`@sontx/simplink-core`](https://www.npmjs.com/package/@sontx/simplink-core) | Load, lint, search, resolve, and export KBs, plus the `simp` CLI |
| [`@sontx/simplink-node`](https://www.npmjs.com/package/@sontx/simplink-node) | Run a federated simp node                                        |
| [simp.sontx.dev](https://simp.sontx.dev)                                     | Browser workspace for exploring and editing a KB                 |

## License

[MIT](https://github.com/sontx/simplink/blob/main/LICENSE)

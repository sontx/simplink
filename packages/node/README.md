# @sontx/simplink-node

[![npm version](https://img.shields.io/npm/v/@sontx/simplink-node.svg)](https://www.npmjs.com/package/@sontx/simplink-node)
[![node](https://img.shields.io/node/v/@sontx/simplink-node.svg)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@sontx/simplink-node.svg)](https://github.com/sontx/simplink/blob/main/LICENSE)

> Federate product knowledge bases: serve a Simplink KB over HTTP and link it to other products' KBs.

A **simp node** serves one [Simplink](https://www.npmjs.com/package/@sontx/simplink-core)
knowledge base to its **peers**, which are other products' KBs. With peers,
a goal in one product can depend on guidance owned by another. For example,
"send a campaign" can require the CRM's "import customers". Each team keeps its
own KB, and agents get one connected plan.

**Browse a running node:** open [simp.sontx.dev](https://simp.sontx.dev), choose
**Connect**, and enter your node's URL to explore its graph, nodes, issues, and
docs read-only. Nodes allow the `https://simp.sontx.dev` origin by default.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Key terms](#key-terms)
- [Declaring peers in `simp.md`](#declaring-peers-in-simpmd)
- [CLI](#cli)
- [HTTP API](#http-api)
- [Library API](#library-api)
- [Related packages](#related-packages)
- [License](#license)

## Install

```sh
npm install -g @sontx/simplink-node
# or
npx -p @sontx/simplink-node simp-node --kb ./kb
```

Requires Node.js 22 or newer.

## Quick start

```sh
simp-node --kb ./kb --port 3393 --token "$SIMP_TOKEN"
# Serving http://127.0.0.1:3393/simp

simp-node lint ./kb --peers   # check remote references against live peers
```

The KB must have a root `simp.md` that names the node.

## Key terms

| Term             | Meaning                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **KB**           | A folder of Markdown files (goals, procedures, capabilities, states, and constraints) that forms a typed graph.                                     |
| **simp**         | A KB identified by the `name` in its root `simp.md` manifest. The prefix also names the CLI commands.                                               |
| **simp node**    | This package's HTTP server. It serves one simp to peers and to the browser workspace.                                                               |
| **peer**         | Another simp declared in `simp.md`. A peer can be a simp node (`http(s)`), a static KB on any web host, or a local folder.                          |
| **qualified ID** | A node ID prefixed with a peer name, such as `crm:goal.import-customers`. Use it in frontmatter edges and in `simp://crm/...` links.                |
| **pull**         | The default serving mode. Consumers fetch the peer's nodes and resolve plans locally.                                                               |
| **delegate**     | An opt-in serving mode. The peer resolves remote plans itself through `/v1/resolve`.                                                                |
| **hops**         | How far a request is forwarded through peers of peers. Limited by `--max-hops`.                                                                     |
| **static peer**  | A KB published as plain files. Add `simp-index.yaml` (from `simp-index`) to enable search. Static peers serve pull only and never forward requests. |

For node types, edges, and plan resolution, see
[Concepts and terms](https://www.npmjs.com/package/@sontx/simplink-core#concepts-and-terms)
in the core README.

## Declaring peers in `simp.md`

```md
---
type: simp
name: campaigns
title: Campaigns
summary: Campaign planning and sending.
serves: [pull] # add delegate to resolve plans for peers
peers:
  - name: crm
    url: https://crm.example.com/simp # simp node, static KB URL, or folder path
    mode: pull
---
```

Then reference the peer's nodes from your own nodes:

```yaml
preconditions: [crm:state.customers-imported]
```

Keep credentials out of `simp.md`. Pass them with `--peer-token crm=...` or
`SIMP_PEER_TOKEN_CRM`.

## CLI

### `simp-node serve` (default command)

This command loads the KB, connects the declared peers, and serves the peer API.

| Flag                        | Env                      | Default                  |
| --------------------------- | ------------------------ | ------------------------ |
| `--kb <dir>`                | `KB_DIR`                 | `kb`                     |
| `--host <host>`             | `HOST`                   | `127.0.0.1`              |
| `--port <n>`                | `PORT`                   | `3393`                   |
| `--base-path <path>`        | `SIMP_BASE_PATH`         | `/simp`                  |
| `--token <token>`           | `SIMP_TOKEN`             | none (no auth)           |
| `--log-format pretty\|json` | `SIMP_LOG_FORMAT`        | `pretty`                 |
| `--max-hops <n>`            |                          | `2`                      |
| `--allowed-host <host>`     | `ALLOWED_HOSTS`          | any host                 |
| `--allowed-origin <origin>` | `ALLOWED_ORIGINS`        | `https://simp.sontx.dev` |
| `--peer <name=url>`         | `SIMP_PEERS`             | URLs from `simp.md`      |
| `--peer-token <name=token>` | `SIMP_PEER_TOKEN_<NAME>` | none                     |
| `--peer-timeout <ms>`       |                          | `2000`                   |

`--peer`, `--peer-token`, `--allowed-host`, and `--allowed-origin` are
repeatable, and flags override environment variables. Use
`--allowed-origin '*'` to allow any browser origin. Declared peers without a URL
are skipped and reported at startup.

### `simp-node lint --peers <kb>`

This command runs the normal KB lint and then looks up every remote reference
on the live peers. It exits `1` on errors and `2` on usage or load failures. A
`W109` warning means a peer was unreachable. It does not prove that the remote
node is missing.

## HTTP API

All routes are under `--base-path` (default `/simp`). Protocol version is `1`.

| Route              | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| `GET /v1/manifest` | Product identity, peers, serving modes, and lint findings         |
| `GET /v1/nodes`    | Every local node without bodies. Never forwarded to peers.        |
| `POST /v1/explore` | Search, optionally forwarded to peers                             |
| `POST /v1/lookup`  | Fetch nodes by ID, optionally forwarded to peers                  |
| `POST /v1/resolve` | Resolve a plan. Available only when `delegate` is served.         |
| `GET /healthz`     | Public KB status. With the token, it also probes and lists peers. |

When `--token` is set, requests need `Authorization: Bearer <token>`. Only
allowed origins receive CORS headers, and preflight requests do not need the
token.

## Library API

```ts
import { startSimpNode } from "@sontx/simplink-node";

const node = await startSimpNode({ kb: "/path/to/kb", port: 0 });
console.log(node.url); // e.g. http://127.0.0.1:51234/simp
await node.close();
```

- `startSimpNode(options)` takes the same settings as the CLI. `kb` can also be a
  loaded `KB`. It returns the URL, the HTTP server, the peer service, the KB
  status, and any skipped peers.
- `createSimpNodeHandler(...)` returns a plain `(req, res)` handler that you can
  mount in your own server.
- `openPeer(url, options?)` detects the peer kind. It tries an `http(s)` URL as
  a simp node first and then as a static KB. It opens a `file:` URL or a path as
  a local folder.
- `httpPeer(baseUrl, options?)` connects directly to a simp node. It is also
  exported from `@sontx/simplink-node/http-peer`.
- `loadPeerConfig(doc, overrides, options)` opens the peers that a `simp.md`
  declares. `parsePeerOverrides(flags, env)` reads overrides the same way the
  CLI does.
- `lintPeers(kb, peers)` returns issues for remote references that the peers
  cannot resolve.

## Related packages

| Package                                                                      | Purpose                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [`@sontx/simplink-core`](https://www.npmjs.com/package/@sontx/simplink-core) | Load, lint, search, resolve, and export KBs, plus `simp-index` for static peers |
| [`@sontx/simplink-mcp`](https://www.npmjs.com/package/@sontx/simplink-mcp)   | Serve a KB, including its peers, to AI agents over MCP                          |
| [simp.sontx.dev](https://simp.sontx.dev)                                     | Browser workspace. Use **Connect** to browse a running node.                    |

## License

[MIT](https://github.com/sontx/simplink/blob/main/LICENSE)

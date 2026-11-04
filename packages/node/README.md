# @sontx/simplink-node

Serve a Simplink KB to peers over HTTP and check federated references against live peers. ESM for Node.js 22+, with TypeScript declarations. Depends on `@sontx/simplink-core`.

The KB must have a root `simp.md`; it names the node and declares the peers it federates with.

## CLI

```sh
simp-node --kb /path/to/kb --port 3393
simp-node lint /path/to/kb --peers
```

`simp-node serve` (the default command) loads the KB, connects the peers declared in `simp.md`, and serves the peer API under `--base-path` (default `/simp`), plus `/healthz`. Routes are `GET /v1/manifest`, `GET /v1/nodes`, and `POST /v1/explore`, `/v1/lookup`, and `/v1/resolve`.

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

`--peer`, `--peer-token`, `--allowed-host`, and `--allowed-origin` are repeatable; flags win over environment variables. `--allowed-origin '*'` allows any origin. Declared peers without a URL are skipped and reported at startup.

`simp-node lint --peers` runs the normal KB lint, then looks up remote references on live peers. It exits `1` on errors and `2` on usage or load failures.

## Library use

```ts
import { startSimpNode } from "@sontx/simplink-node";

const node = await startSimpNode({ kb: "/path/to/kb", port: 0 });
console.log(node.url); // e.g. http://127.0.0.1:51234/simp
await node.close();
```

`startSimpNode(options)` accepts the same settings as the CLI (`kb` may also be a loaded `KB`) and returns the URL, HTTP server, peer service, KB status, and skipped peers. `createSimpNodeHandler` returns a plain `(req, res)` handler to mount in your own server.

Peers:

- `openPeer(url, options?)` detects the peer kind: an `http(s)` URL is tried as a simp node and then as a static KB published with `simp-index`; a `file:` URL or path opens a local folder.
- `httpPeer(baseUrl, options?)` connects to a simp node directly; also exported from `@sontx/simplink-node/http-peer`.
- `loadPeerConfig(doc, overrides, options)` opens the peers a `simp.md` declares; `parsePeerOverrides(flags, env)` reads overrides the way the CLI does.
- `lintPeers(kb, peers)` returns issues for remote references that the peers cannot resolve.

Static and folder peers only serve pulls and never forward requests.

# Simp federation design

Date: 2026-10-21
Status: Draft for review

## 1. Goal

A **simp** is one knowledge base (KB) for one product. It is a concept, not an
implementation: MCP is only one channel for mining a simp. Today each simp is
isolated. This design lets simps link to each other so that:

- A user asks one simp (directly or through MCP) and gets matching results from
  any connected simp, without knowing which simps exist behind it.
- A plan resolved in one simp can include procedures, states, and capabilities
  documented by another simp (cross-product dependencies).
- A simp is itself a knowledge node: it has a homepage document that is
  searchable and linkable.

### Success criteria

- A KB without `simp.md` behaves exactly as it does today (no behavior or
  output changes, existing tests pass unchanged).
- A query to simp X returns hits from peers Y and Z, ranked together, with
  qualified IDs.
- `resolve_goal` in X produces one plan that includes steps from Y when X's
  documents reference Y's nodes, in both pull and delegate mode.
- A peer failure degrades results (warnings, partial results) and never fails a
  request.
- A simp published as static files over HTTP, or present as a local folder, can
  be a peer without running a simp node.

## 2. Decisions

| Topic                               | Decision                                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Topology                            | Peer mesh. Each simp declares its peers; queries fan out with a hop limit and loop detection. A hub is a simp with peers and no other documents. |
| Naming                              | Each simp self-declares a global name in `simp.md`.                                                                                              |
| Frontmatter and wikilink references | `<simp>:<node-id>`, for example `crm:goal.import-customers`.                                                                                     |
| Markdown link references            | `simp://<simp>/<node-id>`; homepage `simp://<simp>`; local `simp:///<node-id>`.                                                                  |
| Resolution                          | Pull (default) and delegate. A peer advertises the modes it serves; the consumer picks one of them.                                              |
| Peer sources                        | A peer URL points to a simp node, a static HTTP KB, or a local folder (`file://` or a path). The consumer detects which (§5a).                   |
| Auth                                | Optional bearer token per node, off by default.                                                                                                  |
| Tenant                              | Not passed between peers in v1. Remote availability is not evaluated.                                                                            |
| Packaging                           | Network-free federation in `core`; HTTP node and HTTP peer client in a new `@sontx/simplink-node` package.                                       |
| MCP                                 | Standalone mode (loads a KB itself) or peer mode (connects to a simp node).                                                                      |
| Default node port                   | 3393                                                                                                                                             |

## 3. The simp document (`simp.md`)

`kb/simp.md` is an optional root-level Markdown file. It is both the manifest
and the homepage of the simp.

```markdown
---
type: simp
name: zalo-oa
title: Zalo OA
summary: Manages Zalo official accounts, followers, and broadcasts.
aliases: [zalo official account]
tags: [zalo, messaging]
docs_url: https://docs.example/zalo-oa
serves: [pull, delegate]
peers:
  - name: crm
    url: https://crm.example/simp
    mode: pull
---

Zalo OA helps teams reach followers on Zalo.

## Start here

- [Send a broadcast campaign](simp:///goal.broadcast.send-campaign)
- Zalo OA needs customers imported by this [CRM import guide](simp://crm/goal.import-customers).
```

### Schema

New `packages/core/schemas/simp.schema.json`, reusing `$defs.common`:

| Field                                  | Required | Rule                                                                                                                                                                                              |
| -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`                                 | yes      | `simp`                                                                                                                                                                                            |
| `name`                                 | yes      | `^[a-z0-9]+(-[a-z0-9]+)*$`                                                                                                                                                                        |
| `title`, `summary`                     | yes      | as `common`                                                                                                                                                                                       |
| `aliases`, `tags`, `related`, `status` | no       | as `common`                                                                                                                                                                                       |
| `docs_url`                             | no       | absolute `http(s)` URL                                                                                                                                                                            |
| `serves`                               | no       | non-empty unique subset of `[pull, delegate]`; default `[pull]`                                                                                                                                   |
| `peers`                                | no       | array of `{name (required, simp name pattern), url (optional; see below), mode (optional, pull or delegate), docs_url (optional, absolute http(s) URL)}`; names unique; must not equal own `name` |

`peers[].url` is an absolute `http(s)://` URL, a `file://` URL, or a filesystem
path. A relative path resolves against the KB root. §5a describes how the
consumer treats each kind.

`unevaluatedProperties: false` applies, as in the other schemas. Tokens are
never stored in `simp.md`.

### Graph node

- New node type `simp`. Local ID `simp`; qualified ID `<name>:simp`.
- `NodeType`, `EDGE_KINDS` handling, search indexing, and `get_node` support it.
- Body links become `related` edges with `source: "body"`.
- Docs export renders it as the index page.

### Loader

`loadDocs` drops root-level files today. It accepts exactly one root-level file
named `simp.md`. A `type` other than `simp` in that file is E003. Any other
root-level file is still dropped.

## 4. References

### Syntax

| Location                                                | Local                                          | Remote                                                                    |
| ------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| Frontmatter ref fields, `choices[].options[].procedure` | `goal.x`                                       | `crm:goal.x`                                                              |
| Markdown links (canonical in bodies)                    | `[t](simp:///goal.x)`, `[t](simp:///goal.x#h)` | `[t](simp://crm/goal.x)`, `[t](simp://crm/goal.x#h)`, `[t](simp://crm)`   |
| Wikilinks (supported shorthand)                         | `[[goal.x]]`, `[[goal.x\|t]]`, `[[goal.x#h]]`  | `[[crm:goal.x]]`, `[[crm:goal.x\|t]]`, `[[crm:goal.x#h]]`, `[[crm:simp]]` |

- `simp://` Markdown links are the canonical body link form. They are valid
  CommonMark, so standard renderers show them as links.
- Wikilinks remain fully supported so existing KBs keep working. They produce
  the same edges and lint results as the equivalent `simp://` link. Docs,
  templates, and the `product-kb-builder` skill teach `simp://` first.
- A URI fragment (`#h`) targets a heading, matching the existing wikilink
  `#heading` behavior.
- The ref schema patterns accept an optional `<simp>:` prefix. The type check
  is kept because the type is part of the node ID.
- A Markdown link becomes a KB link only when its href uses the `simp:` scheme.
  Other hrefs (`https:`, relative paths, `mailto:`) stay external links.
- Code spans and fenced code are ignored, as for wikilinks today.
- An unqualified ID always means a node of the simp that owns the document.
- A reference qualified with the simp's own name is normalized to the local ID.

### IDs in output

- Local nodes are unqualified. Remote nodes are qualified.
- Tool inputs accept both forms.
- When a simp receives a node from peer P, it qualifies every unqualified ID in
  that node with P's name. A node keeps the same qualified ID everywhere in the
  mesh.

### Lint

| Mode                                   | Rule                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline (`simp lint`, default)         | A qualified reference whose prefix is a declared peer passes. An undeclared prefix is **E016 unknown simp**. A qualified reference in a KB without `simp.md` is E016. |
| Online (`simp-node lint --peers <kb>`) | Each remote reference is looked up. A missing node is E007; a wrong type is E003; an unreachable peer is **W109 peer unreachable**.                                   |

## 5. Peer API

Plain HTTP and JSON under a base URL (for example `https://crm.example/simp`),
versioned under `/v1`. All IDs in responses are qualified from the responding
simp's view (its own nodes unqualified).

| Endpoint           | Request                                         | Response                                                                               |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /v1/manifest` | none                                            | `{protocol: 1, name, title, summary, tags, serves, docs_url?, peers: [names], errors}` |
| `GET /v1/nodes`    | none                                            | `{nodes}` (every local node, no bodies, never forwarded)                               |
| `POST /v1/explore` | `{query, types?, limit?, trace}`                | `{hits, goals, sources}`                                                               |
| `POST /v1/lookup`  | `{ids, body?, trace}`                           | `{nodes, missing, sources}`                                                            |
| `POST /v1/resolve` | `{target, states?, choices?, maxDepth?, trace}` | `{resolved, sources}`                                                                  |
| `GET /healthz`     | none                                            | `{ok, kb, peers: [{name, ok, ms}]}`                                                    |

- `/v1/resolve` exists only when `serves` contains `delegate`; otherwise 404.
- Only origins in `allowedOrigins` get CORS headers (`access-control-allow-origin`
  echoes the origin). `OPTIONS` preflights from those origins return 204 without
  the token.
- `explore` hits use the existing `SearchHit` and `GoalHit` shapes.
- A `lookup` node contains `id, type, title, summary, status, aliases, tags,
fields` (raw frontmatter), `body` (when requested), and `out` and `in` edges.
- `resolve` returns the existing `ResolvedGoal` JSON with qualified IDs and the
  states each alternative produces.
- `get_related` is not an endpoint. The consumer runs the BFS over batched
  `lookup` calls (depth at most 3).

### Mesh control

`trace = {requestId, hops, visited}`.

- `hops` defaults to 2. A node caps it with its own `--max-hops`.
- A node forwards only to peers not in `visited`, after adding its own name to
  `visited` and decrementing `hops`. With `hops` 0 it answers locally only.
- `lookup` and `resolve` forward a qualified ID to the peer that owns it, so X
  reaches CRM through Y when X has no CRM entry. When the owner is not a direct
  peer, the request goes to direct peers that list the owner in their manifest
  `peers`, or to all eligible direct peers when none does.
- A `resolve` for a local target federates the simp's own cross-simp
  dependencies (pull through its peers), so a delegated plan is complete.
- Each peer call has a timeout (default 2000 ms).
- `sources: [{simp, ok, error?, ms}]` reports which simps answered.

### Auth

- When started with `--token` or `SIMP_TOKEN`, every `/v1/*` request requires
  `Authorization: Bearer <token>`; otherwise 401.
- Without a token, no auth is required.
- `/healthz` never requires auth.

## 5a. Static and folder peers

A peer does not have to run a simp node. A KB can also be used as:

- a **static HTTP peer**: the KB folder published as plain files on any HTTP
  server (CDN, GitHub Pages, nginx), or
- a **folder peer**: a KB folder on local disk.

`simp.md` has no field for the peer kind. The consumer detects it from the URL.

### Detection

| URL                  | Kind                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file://…` or a path | Folder peer                                                                                                                                                             |
| `http(s)://…`        | `GET <url>/v1/manifest` returns JSON with `protocol` → simp node. Otherwise `GET <url>/simp.md` has frontmatter `type: simp` → static HTTP peer. Otherwise unreachable. |

- The detected kind is cached together with the manifest (60 s).
- The `simp.md` check also rejects SPA fallbacks that answer every path with
  HTML.

### Paths from IDs

A node ID maps one-to-one to its file path (`deriveId` and `FOLDER_TO_TYPE` in
core):

| ID                                  | Path                                      |
| ----------------------------------- | ----------------------------------------- |
| `crm:procedure.broadcast.send-zalo` | `<url>/procedures/broadcast/send-zalo.md` |
| `crm:goal.import-customers`         | `<url>/goals/import-customers.md`         |
| `crm:simp`                          | `<url>/simp.md`                           |

An ID must match the ID pattern before a URL is built from it, so it cannot
escape `<url>`.

### Index file (`simp-index.yaml`)

HTTP cannot list directories. Search and incoming edges need the full file
list, so a static HTTP peer can publish an optional index at its root:

```yaml
protocol: 1
name: crm
files:
  - goals/import-customers.md
  - procedures/import/csv.md
```

- `files` are the `.md` paths that `loadDocs` accepts, sorted.
- The loader drops root-level files other than `simp.md`, so the index never
  becomes a node.
- There is no index by default.

The core bin `simp-index [kb]` (default `kb`) writes or re-syncs
`<kb>/simp-index.yaml` from the current files. It uses the filesystem only.
Re-running it on unchanged files gives the same output. It fails when the KB
has no `simp.md`. A stale index lists removed files (they become `missing`) and
leaves new files out of search.

### Behavior

| Capability                            | Static, no index                 | Static with index, or folder |
| ------------------------------------- | -------------------------------- | ---------------------------- |
| `lookup`, pull resolution, `get_node` | Per-ID `GET`; 404 → `missing`    | From the loaded KB           |
| `explore` (search)                    | Skipped; not listed in `sources` | Yes                          |
| `in` edges, goal surfacing            | Empty                            | Yes                          |
| Delegate                              | No                               | No                           |

- **Loaded KB**: a folder peer uses `createKB(fsSource(root))`, and ignores any
  index because it can list the folder. A static peer with an index fetches
  every listed file and uses `createKB(memorySource(files))`. Both are wrapped
  in `createPeerService({kb, peers: []})`, so they answer like a node with no
  peers. The KB reloads on the manifest TTL; a static peer reloads only when
  the index body changes.
- **Static peer without an index**: each `lookup` fetches the derived URLs in
  parallel and parses them with `parseDoc`. `out` edges come from the
  document's own frontmatter refs and body links.
- **Manifest**: built from the peer's `simp.md` (`name`, `title`, `summary`,
  `tags`, `docs_url`, `peers` names). `serves` is always `[pull]`. `errors` is
  the lint error count when the KB is loaded, otherwise 0.
- **Mesh**: folder and static peers are leaves. They do not forward requests,
  and the consumer does not follow their `peers`.
- **Limits** (static HTTP): at most 5000 files and 20 MB per KB; only URLs
  under `<url>` on the same origin. Redirects are followed manually (at most 3)
  and only when the target is also under `<url>`.
- **Auth** (static HTTP): the peer token, when set, is sent as
  `Authorization: Bearer <token>` on every `GET`.

## 6. Federation in core

### `Peer` interface

```ts
interface Peer {
  name: string;
  manifest(): Promise<SimpManifest>;
  explore(req: ExploreRequest): Promise<ExploreResponse>;
  lookup(req: LookupRequest): Promise<LookupResponse>;
  resolve?(req: ResolveRequest): Promise<ResolveResponse>;
}
```

Core contains no network code. Tests use in-memory peers.

### `createFederatedKB`

```ts
createFederatedKB(options: {
  local?: KB;
  peers: Peer[];
  hops?: number;      // default 2
  timeoutMs?: number; // default 2000
}): FederatedKB
```

`FederatedKB` is async and provides `search`, `node`, `related`, `resolveGoal`,
`resolveProcedure`, `render`, and `status`. `local` is optional so that MCP peer
mode can run without a KB.

### Search merging

- Each simp returns `relevance` normalized to its own top hit.
- Merged rank = `relevance × 0.9^hops`; local hits win ties.
- Results are deduplicated by qualified ID. `minRelevance` and `limit` apply
  after merging.
- Cross-simp goal surfacing: the graph `in` map also records edges to qualified
  remote IDs. If a remote hit has such an edge, `goalsOf` surfaces the local
  goals that reach it.

### Pull mode

1. Prefetch: walk the closure from the target, collect qualified references,
   and `lookup` them in batches per simp until no new references appear or
   `maxDepth` (8) is reached.
2. Build an overlay graph: the local graph plus the remote nodes, keyed by
   qualified ID.
3. Run the existing synchronous `resolveGoal` or `resolveProcedure` on the
   overlay. The resolver is not changed.

### Delegate mode

- Applies to procedures only. States and capabilities are always pulled through
  `lookup`, so check steps stay local.
- During prefetch, a reference to a procedure owned by a delegate-mode peer
  becomes one `resolve` call. It passes the states known so far and the choices
  for that simp (keys `crm:choiceId`).
- The result becomes a placeholder node in the overlay whose `produces` are the
  states guaranteed after the remote plan: checked states, `produces` of
  unconditional run steps, states fixed by conditional steps, and states from
  selected choice options. Side effects of conditional steps are not included.
- After resolution, the remote top-alternative plan replaces the placeholder
  step. Step conditions (`when`) and choices are kept, and the placeholder's own
  condition is added to each spliced step. Its warnings are carried into the
  plan.

### Mode selection per peer

1. The preferred mode (`simp.md` `peers[].mode`), if the peer's `serves`
   contains it.
2. Otherwise `pull` if served, else `delegate`.
3. If neither is possible, the reference becomes a missing-node warning (the
   existing path in `resolve.ts`).

Folder and static peers serve only `pull`, so a preferred `delegate` falls back
to `pull`.

### Availability

Remote nodes' `availability` is not evaluated. The plan adds the warning
`availability of <id> not checked`.

## 7. `@sontx/simplink-node`

New package depending on `@sontx/simplink-core`.

### Exports

- `createSimpNodeHandler({kb, peers, token?, maxHops, timeoutMs})` returns a
  Node HTTP request handler for the peer API.
- `httpPeer(url, {name?, token?, timeoutMs, fetch?})` returns a `Peer`. It caches
  the manifest for 60 s and sends the bearer token when set. Without `name`, the
  first manifest sets it (MCP `--simp` uses this); later manifests with another
  name are rejected.
- `openPeer(url, {name?, token?, timeoutMs, fetch?, kbRoot})` detects the peer
  kind (§5a) and returns a `Peer` for a simp node (`httpPeer`), a static HTTP
  KB, or a folder. `kbRoot` resolves relative paths. `loadPeerConfig`, the
  node, MCP, and online lint open peers through it.
- `loadPeerConfig(manifest, overrides)` merges `simp.md` peers with runtime
  overrides.

Static and folder peer code lives in this package, so core stays network-free.
It reuses core's `fsSource`, `memorySource`, `parseDoc`, and
`createPeerService`.

### Bin `simp-node`

| Flag                                       | Env var                            | Default                        |
| ------------------------------------------ | ---------------------------------- | ------------------------------ |
| `--kb`                                     | `KB_DIR`                           | `kb`                           |
| `--host`                                   | `HOST`                             | `127.0.0.1`                    |
| `--port`                                   | `PORT`                             | `3393`                         |
| `--base-path`                              | `SIMP_BASE_PATH`                   | `/simp`                        |
| `--token`                                  | `SIMP_TOKEN`                       | none (no auth)                 |
| `--peer <name>=<url>` (repeatable)         | `SIMP_PEERS` (comma-separated)     | none; overrides `simp.md` URLs |
| `--peer-token <name>=<token>` (repeatable) | `SIMP_PEER_TOKEN_<NAME>`           | none                           |
| `--max-hops`                               | none                               | `2`                            |
| `--peer-timeout`                           | none                               | `2000` ms                      |
| `--allowed-host`, `--allowed-origin`       | `ALLOWED_HOSTS`, `ALLOWED_ORIGINS` | none                           |

- `<NAME>` in env var names is the peer name uppercased with `-` replaced by `_`.
- Starting without `simp.md` is an error.
- The node serves even when the KB has lint errors; `manifest.errors` reports
  the count.
- `simp-node lint --peers <kb>` runs the online lint.

## 8. MCP changes

### Modes

| Mode                 | Flags                                      | Behavior                                                                                                                                     |
| -------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Standalone (default) | `--kb <dir>`                               | Loads the KB in-process. Federates peers declared in `simp.md` through `createFederatedKB` and `httpPeer`. `--no-peers` disables federation. |
| Peer                 | `--simp <url>` and optional `--simp-token` | No local KB. Uses `createFederatedKB({peers: [openPeer(url)]})`. `<url>` may be a simp node, a static HTTP KB, or a folder.                  |

`--kb` and `--simp` together is an argument error. Both `simp-mcp` and
`simp-mcp-http` support both modes. `@sontx/simplink-mcp` depends on
`@sontx/simplink-node` for `openPeer`. In peer mode against a static simp
without an index, search returns no results.

### Tools

Tool names do not change.

- `search_kb`: `types` accepts `simp`; hits carry qualified IDs and
  `simp: "<name>"` for remote hits.
- `get_node`, `get_related`: accept qualified IDs; edges list qualified IDs.
- `resolve_goal`, `resolve_procedure`: `choices` keys may be `crm:choiceId`;
  federation warnings are included in the plan.
- Unknown IDs keep the "Did you mean" response, backed by federated search.
- `SERVER_INSTRUCTIONS` adds: "IDs like `crm:goal.x` belong to other products;
  use them as-is."
- `createKBTools` accepts a `FederatedKB` in addition to the current inputs.

## 9. Error handling

| Situation                                                                                          | Behavior                                                                               |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Peer unreachable, timeout, 5xx                                                                     | `sources` entry with `error`; plan warning; `missingRef` placeholder; request succeeds |
| Peer returns 401                                                                                   | As above with `error: "unauthorized"`; logged at most once per peer per minute         |
| Unsupported `protocol`                                                                             | Peer skipped with a warning                                                            |
| `hops` exhausted or simp in `visited`                                                              | Answer locally; no forwarding                                                          |
| Peer P returns a node owned by a simp that is neither P nor a simp listed as `ok` in P's `sources` | Node rejected and logged (spoofing protection)                                         |
| Invalid request body                                                                               | 400 with Ajv errors                                                                    |
| KB has lint errors                                                                                 | Serve; `manifest.errors` reports the count                                             |
| Static peer `simp.md` missing or not `type: simp`; folder without `simp.md`                        | Peer unreachable (W109 in online lint; failed `sources` entry)                         |
| Static index invalid, over the limits, or lists an invalid path                                    | Failed `sources` entry with `error: "invalid index"`                                   |
| Static file returns 404                                                                            | Node reported in `missing`                                                             |

## 10. UI (v1)

- The docs preview renders `simp.md` as the homepage.
- Remote `simp://` links and qualified wikilinks link to
  `<docs_url>/<ID-derived path>#<fragment>` when the `simp.md` peer entry has
  `docs_url`, for example `[CRM import guide](simp://crm/goal.import-customers#steps)`
  → `https://docs.example/crm/goals/import-customers.md#steps`. A homepage link
  (`simp://crm`) goes to `<docs_url>/`. Without `docs_url` the link renders as
  labeled text, for example "CRM import guide (crm)".
- The ID-derived path matches the peer's graph-layout export. It does not match
  pages moved by a frontmatter docs path or the site layout; those links break.
- Missing local targets keep the inline-code rendering.
- No peer connections from the browser.

Docs export follows the same link rules.

## 11. Testing

Use `node:test` and `node:assert/strict`.

- **core**: `simp.md` schema and loader (single root file, E003); qualified-ref
  patterns; E016; `simp://` links and qualified wikilinks become edges; merged
  search ranking; goal surfacing through remote refs; pull prefetch and overlay
  graph; delegate fragments and `produces`; mode selection; warning paths. Uses
  in-memory peers. `simp-index` writes sorted YAML, gives the same output on a
  rerun, and fails without `simp.md`; the loader ignores `simp-index.yaml`.
- **node**: HTTP API contract; auth on and off; hop limit; loop detection (X↔Y);
  forwarding X→Y→CRM; per-peer timeout and partial results; spoofing rejection;
  online lint. Uses 2–3 real servers on ephemeral ports with fixtures under
  `test/fixtures/mesh/{zalo-oa,crm,hub}/`.
- **node, static and folder peers**: a static file server on an ephemeral port
  (`node:http` and `fs`) serving `test/fixtures/mesh/crm` with and without
  `simp-index.yaml`. Covers detection (node, static, SPA fallback), pull
  resolution without an index, search with an index, a traversal path in the
  index rejected, the size limit, and the token header. Folder peers via
  `file://` and a relative path: search and pull work, and a missing `simp.md`
  is a failed source.
- **mcp**: `--simp` mode against a node fixture; standalone with declared peers;
  `--kb` with `--simp` rejected.
- Existing suites pass unchanged.

## 12. Knowledge base updates

Add `kb/` nodes for: writing `simp.md`, referencing other simps, running a simp
node, connecting MCP to a simp, publishing a simp as static files or a folder
(including `simp-index` to enable search), and mesh constraints (hop limit, no
tenant pass-through, optional auth). Document `simp://` as the canonical body link
form and wikilinks as supported shorthand, in `kb/` and in
`.agents/skills/product-kb-builder/` (schema reference and templates). Existing
`kb/` wikilinks are not rewritten. Update `kb/INVENTORY.md`. `pnpm lint:kb` must pass.

## 13. Out of scope (v1)

- Tenant pass-through and remote availability evaluation
- Browser-side federation
- Peer discovery beyond `simp.md` and runtime config
- Caching other than manifests
- Hot reload
- Docker image changes
- Forwarding through folder or static peers, and delegate mode on them
- Automatic `simp-index.yaml` regeneration (watchers or hooks)
- Folder peers in the browser UI

# Simp Federation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let simps (one KB per product) link to each other so searches and plans span products transparently, with each simp optionally serving a small HTTP explore/lookup/resolve API.

**Architecture:** Core gains the `simp` node type (`simp.md`), qualified references (`crm:goal.x`, `simp://crm/goal.x`), and a network-free federation layer: a `PeerService` that answers explore/lookup/resolve for one KB and forwards to `Peer`s, plus a `FederatedKB` facade the tools run on. A new `@sontx/simplink-node` package wraps `PeerService` in HTTP and provides `httpPeer`. MCP either loads a KB itself (standalone, federating declared peers) or uses a simp node as its home.

**Tech Stack:** TypeScript (ESM, NodeNext), pnpm workspaces, Ajv 2020, MiniSearch, `node:test`, `node:http`, global `fetch` (Node 20).

**Spec:** `docs/superpowers/specs/2026-10-21-simp-federation-design.md`

## Global Constraints

- Node.js >= 20; `pnpm@12.14.0`; ESM with `.js` suffixes in relative imports; two-space indent, double quotes, semicolons.
- `packages/mcp` and `packages/node` import core only through `@sontx/simplink-core`, never across `src/` directories.
- Core stays network-free: no `fetch`, `node:http`, or sockets under `packages/core/src/`.
- A KB without `simp.md` behaves exactly as today; all existing tests pass unchanged except where a task explicitly updates an assertion for the `simp` type.
- Simp name pattern: `^[a-z0-9]+(-[a-z0-9]+)*$`.
- Qualified reference: `<simp>:<node-id>`; Markdown link: `simp://<simp>/<node-id>[#heading]`, homepage `simp://<simp>`, local `simp:///<node-id>`.
- Peer API base path default `/simp`, versioned `/v1`; `protocol: 1`.
- Defaults: hops `2`, peer timeout `2000` ms, manifest cache `60` s, node port `3393`, merge decay `0.9` per hop.
- New diagnostics: `E016` unknown simp, `W109` peer unreachable.
- Warning text: `availability of <id> not checked`.
- MCP instructions line: `IDs like \`crm:goal.x\` belong to other products; use them as-is.`
- Breaking (pre-1.0) API change: `KBToolSpec.handler` and the `tools` transform receive a `FederatedKB` instead of a `KB`; `FederatedKB.local` exposes the `KB` when there is one.

## Review Focus

1. **Peer returns malformed JSON or a non-JSON 200** — treat as a failed source (`error: "invalid response"`), never throw. Test in Task 10.
2. **Two simps both named the same (`name` collision in the mesh)** — a peer whose manifest `name` differs from the configured peer name is skipped with a warning. Test in Task 10.
3. **Remote node referenced by qualified ID with the wrong type prefix in a goal's `procedures`** (e.g. `crm:state.x`) — schema E008 offline, like local refs. Test in Task 2.
4. **Self-reference cycle through the mesh (X → Y → X) during pull prefetch** — X's own nodes coming back qualified as `x:...` are normalized to local, not fetched again. Test in Task 6.
5. **`resolve_goal` on a remote goal ID (`crm:goal.x`) taken straight from a search hit** — resolves through pull with the goal itself fetched. Test in Task 6.

---

## File Structure

**Core (`packages/core/`)**

- `schemas/simp.schema.json` — new; simp document schema.
- `schemas/defs.schema.json` — ref patterns accept `<simp>:` prefix; `type` enum adds `simp`.
- `src/types.ts` — `simp` in `NODE_TYPES`.
- `src/ids.ts` — new; qualified ID parsing, qualification, own-name normalization.
- `src/links.ts` — new; body link extraction (wikilinks + `simp:` Markdown links).
- `src/loader.ts`, `src/lint.ts`, `src/graph.ts`, `src/lint-graph.ts` — root `simp.md`, normalization, remote `in` entries, E016.
- `src/docs.ts`, `src/docs-layout.ts` — homepage and `simp:` link rendering.
- `src/federation/protocol.ts` — new; wire types shared by core, node, and mcp.
- `src/federation/service.ts` — new; `createPeerService` (explore, lookup, forwarding, trace).
- `src/federation/merge.ts` — new; search result merging.
- `src/federation/prefetch.ts` — new; pull/delegate prefetch and overlay graph.
- `src/federation/kb.ts` — new; `createFederatedKB`.
- `src/tools/core.ts` — handlers run on `FederatedKB`.
- `src/index.ts`, `src/browser.ts` — exports.

**Node (`packages/node/`)** — new package `@sontx/simplink-node`

- `src/http.ts` — `createSimpNodeHandler`.
- `src/http-peer.ts` — `httpPeer`.
- `src/config.ts` — `loadPeerConfig`, env/flag parsing helpers.
- `src/lint-peers.ts` — online lint.
- `src/bin.ts` — `simp-node` (serve and `lint --peers`).
- `src/index.ts` — public exports.

**MCP (`packages/mcp/`)** — `src/bin.ts`, `src/http-bin.ts`, `src/server.ts`, `src/http.ts`, `src/kb-source.ts` (new; mode selection).

**UI (`packages/ui/`)** — `src/lib/frontmatter.ts`, `src/workspace/service.ts`, `src/routes/nodes/index.tsx`.

**Fixtures** — `test/fixtures/mesh/{zalo-oa,crm,hub}/`.

---

## Phase A — Offline core

### Task 1: `simp` node type, schema, and root `simp.md` loading

**Files:**

- Create: `packages/core/schemas/simp.schema.json`
- Modify: `packages/core/schemas/defs.schema.json` (`common.properties.type.enum`)
- Modify: `packages/core/src/types.ts:9-15` (`NODE_TYPES`)
- Modify: `packages/core/src/loader.ts:28-38` (`deriveId`), `:73-104` (`loadDocs` filter)
- Modify: `packages/core/src/lint.ts` (E003 message for root files)
- Modify: `packages/core/src/lint-graph.ts:103-105` (W101 skips `simp`)
- Modify: `packages/core/src/docs-layout.ts` (`siteGraph`, `siteIndexes`)
- Modify: `packages/ui/src/lib/frontmatter.ts:4-9`, `packages/ui/src/workspace/service.ts` (add `simp.schema.json` to compiled schemas), `packages/ui/src/routes/nodes/index.tsx:85` (use core `NODE_TYPES`)
- Test: `packages/core/test/simp-doc.test.ts`

**Interfaces:**

- Produces: `NODE_TYPES` includes `"simp"`; `deriveId("simp.md") → { folderType: "simp", derivedId: "simp" }`; the simp node has `id: "simp"`, `path: "simp.md"`, `data.name` etc.
- Produces (`src/simp-doc.ts`, new file):

  ```ts
  export interface SimpPeerDecl {
    name: string;
    url?: string;
    mode?: "pull" | "delegate";
  }
  export interface SimpDoc {
    name: string;
    title: string;
    summary: string;
    tags: string[];
    docsUrl?: string;
    serves: ("pull" | "delegate")[];
    peers: SimpPeerDecl[];
  }
  export function simpDoc(graph: KBGraph): SimpDoc | undefined; // undefined when no simp node; serves defaults to ["pull"]
  ```

- [ ] **Step 1: Write failing tests** in `packages/core/test/simp-doc.test.ts` using `fixture()` from `helpers.ts`:
  - `"loads root simp.md as the simp node"`: files `simp.md` (type simp, name `zalo-oa`, title, summary) + `goals/a.md` + `procedures/a.md`; assert `graph.nodes.get("simp")?.type === "simp"`, `errorCount === 0`, `simpDoc(graph)?.name === "zalo-oa"`, `simpDoc(graph)?.serves` deep-equals `["pull"]`.
  - `"rejects a root simp.md with another type"`: `simp.md` with `type: goal` → an issue `{code: "E003", path: "simp.md"}`.
  - `"still drops other root-level files"`: `README.md` at root → no node, no issue.
  - `"validates simp.md fields"`: `name: Bad_Name` → E008; unknown key `foo: 1` → E005; `peers: [{name: zalo-oa}]` where own name is `zalo-oa` → E012; `serves: []` → E006.
  - `"does not report the simp node as an orphan"`: no W101 for `simp.md`.
  - `"site docs use simp.md as the root index"`: `exportDocs(graph)` page `index.md` contains the simp title as `# <title>` and its body text, followed by the generated listing; no page has path `simp.md`.
- [ ] **Step 2: Run** `pnpm --filter @sontx/simplink-core exec tsx --test test/simp-doc.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `simp.schema.json`: `$id` `https://kb.local/schemas/simp.schema.json`, `allOf: [{$ref: defs#/$defs/common}]`, `required: [name]`, properties per spec §3 table, `unevaluatedProperties: false`. "Peers must not equal own name" cannot be expressed in JSON Schema; check it in `lint-graph.ts` and emit `E012` `peers: "<name>" is this simp's own name`. Unique peer names: same place, `E012` `duplicate peer "<name>"`.
  - `deriveId`: `relPath === "simp.md"` → `{ folderType: "simp", derivedId: "simp" }`.
  - `loadDocs` filter: keep `f.relPath === "simp.md"` in addition to nested files.
  - `siteGraph`: map the simp node to path `index.md`; `siteIndexes` root page: when a simp node exists, its heading/summary/body replace `"Documentation"` / the default summary, and the simp node itself is not emitted as a separate page (graph layout keeps `simp.md`).
  - UI: import `simp.schema.json` alongside the other schemas; replace the local `NODE_TYPES` literal with the core export.
- [ ] **Step 4: Run** the test file, then `pnpm --filter @sontx/simplink-core test` — Expected: PASS (update any existing assertion that enumerates `NODE_TYPES` to include `simp`).
- [ ] **Step 5: Commit** `git commit -m "Add simp document type loaded from root simp.md"`

### Task 2: Qualified references, `simp:` body links, and E016

**Files:**

- Create: `packages/core/src/ids.ts`, `packages/core/src/links.ts`
- Modify: `packages/core/schemas/defs.schema.json` (ref patterns)
- Modify: `packages/core/src/graph.ts:57-92` (`buildGraph`), `packages/core/src/lint.ts` (own-name normalization before `buildGraph`), `packages/core/src/lint-graph.ts:17-24` (E007 skip, E016)
- Modify: `packages/core/src/docs.ts:41-100,152-170` (`proseLinks`, `link`), `packages/core/src/docs.ts` `DocsOptions`
- Test: `packages/core/test/references.test.ts`

**Interfaces:**

- Produces (`src/ids.ts`):
  ```ts
  export interface QualifiedId {
    simp?: string;
    id: string;
  }
  export function parseRef(ref: string): QualifiedId; // "crm:goal.x" → {simp:"crm", id:"goal.x"}; "goal.x" → {id:"goal.x"}
  export function formatRef(ref: QualifiedId): string;
  export function isQualified(ref: string): boolean;
  export function qualify(ref: string, simp: string): string; // leaves already-qualified refs alone
  export function localize(ref: string, ownName: string | undefined): string; // "own:goal.x" → "goal.x"
  export function rewriteRefs(
    data: Record<string, unknown>,
    map: (ref: string) => string,
  ): Record<string, unknown>;
  // applies map to every EDGE_KINDS array entry and every choices[].options[].procedure; returns a copy
  ```
- Produces (`src/links.ts`):
  ```ts
  export interface BodyLink {
    ref: string;
    fragment?: string;
    label?: string;
  }
  export function extractBodyLinks(body: string): BodyLink[]; // wikilinks + [t](simp://...) links, code ignored, first-occurrence order, unique by ref
  export function parseSimpUri(href: string): BodyLink | undefined; // "simp://crm/goal.x#h" → {ref:"crm:goal.x", fragment:"h"}; "simp://crm" → {ref:"crm:simp"}; "simp:///goal.x" → {ref:"goal.x"}
  ```
- Produces: `DocsOptions.remoteLink?: (ref: string, label: string) => string | undefined` — returns a Markdown link for a remote ref, or undefined for the default labeled text `label (simp)`.

- [ ] **Step 1: Write failing tests** in `packages/core/test/references.test.ts`:
  - `parseSimpUri` table: `simp://crm/goal.x` → `{ref:"crm:goal.x"}`; `simp://crm/goal.x#steps` → fragment `steps`; `simp://crm` → `crm:simp`; `simp:///goal.x` → `goal.x`; `https://x` → undefined.
  - `"simp links and qualified wikilinks become related body edges"`: KB with `simp.md` (peers `[crm]`) and a procedure body containing `[[crm:goal.a]]`, `[t](simp://crm/state.b)`, `[t](simp:///goal.local)`, `` `[[crm:goal.ignored]]` ``; assert edges `{to:"crm:goal.a",kind:"related",source:"body"}`, `{to:"crm:state.b"}`, `{to:"goal.local"}` and none for `goal.ignored`.
  - `"qualified frontmatter refs pass schema"`: `preconditions: [crm:state.x]`, `procedures: [crm:procedure.y]` → no E008.
  - `"qualified ref with wrong type prefix fails schema"`: goal `procedures: [crm:state.x]` → E008. _(Review Focus 3)_
  - `"undeclared simp prefix is E016"`: ref `billing:state.x` with peers `[crm]` → E016 message `unknown simp "billing"`; same ref with no `simp.md` → E016.
  - `"declared remote refs are not E007"`: `crm:state.x` with peers `[crm]` → no E007.
  - `"own-name refs normalize to local ids"`: own name `zalo-oa`, `requires: [zalo-oa:procedure.b]` where `procedures/b.md` exists → edge `to: "procedure.b"`, no E007/E016, and `node.data.requires` deep-equals `["procedure.b"]`.
  - `"incoming map records remote targets"`: `graph.in.get("crm:state.x")` contains the edge from the referencing procedure.
  - `"docs render remote links as labeled text by default"`: page text contains `CRM import (crm)` for `[CRM import](simp://crm/goal.import)`; with `remoteLink: (ref, label) => \`[${label}](https://d/${ref})\``contains`[CRM import](https://d/crm:goal.import)`.
- [ ] **Step 2: Run** `pnpm --filter @sontx/simplink-core exec tsx --test test/references.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Patterns: keep `nodeId` (used by `common.id`) unqualified; add prefix group `(?:[a-z0-9]+(?:-[a-z0-9]+)*:)?` to `goalId`, `procedureId`, `capabilityId`, `stateId`, `constraintId`; add `nodeRef` = optional prefix + (`nodeId` body | `simp`) and point `nodeRefs.items` at it.
  - `lintKB`: after collecting nodes, if a simp node exists, replace each node's `data` with `rewriteRefs(data, r => localize(r, name))`.
  - `buildGraph`: use `extractBodyLinks` (localized with the simp name) instead of `extractWikilinks`; keep `extractWikilinks` exported unchanged. For qualified targets create `in` entries on demand.
  - `lintGraph`: qualified targets skip E007/W104; prefix not in `simpDoc(g)?.peers` names → E016 `${label}: unknown simp "${simp}"`.
  - `proseLinks`: recognize `[label](simp:...)` in addition to wikilinks; local refs use the existing `link()`; remote refs use `opts.remoteLink` or `` `${label} (${simp})` ``.
- [ ] **Step 4: Run** the test file and `pnpm --filter @sontx/simplink-core test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Support qualified references and simp:// body links"`

---

## Phase B — Federation in core

### Task 3: Protocol types and single-KB `PeerService` (explore, lookup)

**Files:**

- Create: `packages/core/src/federation/protocol.ts`, `packages/core/src/federation/service.ts`
- Modify: `packages/core/src/index.ts`, `packages/core/src/browser.ts` (export federation)
- Test: `packages/core/test/peer-service.test.ts`

**Interfaces:**

- Produces (`protocol.ts`):
  ```ts
  export const PROTOCOL_VERSION = 1;
  export type ResolutionMode = "pull" | "delegate";
  export interface SimpManifest {
    protocol: number;
    name: string;
    title: string;
    summary: string;
    tags: string[];
    serves: ResolutionMode[];
    docs_url?: string;
    peers: string[];
    errors: number;
  }
  export interface Trace {
    requestId: string;
    hops: number;
    visited: string[];
  }
  export interface SourceStatus {
    simp: string;
    ok: boolean;
    error?: string;
    ms: number;
  }
  export interface ExploreRequest {
    query: string;
    types?: NodeType[];
    limit?: number;
    trace: Trace;
  }
  export interface ExploreResponse {
    hits: SearchHit[];
    goals: GoalHit[];
    sources: SourceStatus[];
  }
  export interface LookupNode {
    id: string;
    type: NodeType;
    title: string;
    summary: string;
    status: "active" | "deprecated";
    aliases: string[];
    tags: string[];
    availability?: Availability;
    fields: Record<string, unknown>;
    body?: string;
    out: { kind: EdgeKind; to: string }[];
    in: { kind: EdgeKind; from: string }[];
  }
  export interface LookupRequest {
    ids: string[];
    body?: boolean;
    trace: Trace;
  }
  export interface LookupResponse {
    nodes: LookupNode[];
    missing: string[];
    sources: SourceStatus[];
  }
  export interface ResolveRequest {
    target: string;
    states?: Record<string, boolean>;
    choices?: Record<string, string>;
    maxDepth?: number;
    trace: Trace;
  }
  export interface ResolveResponse {
    resolved: ResolvedGoal;
    produces: string[];
    sources: SourceStatus[];
  } // produces = states of the top alternative
  export interface Peer {
    name: string;
    manifest(): Promise<SimpManifest>;
    explore(r: ExploreRequest): Promise<ExploreResponse>;
    lookup(r: LookupRequest): Promise<LookupResponse>;
    resolve?(r: ResolveRequest): Promise<ResolveResponse>;
  }
  export function newTrace(hops?: number): Trace; // requestId = crypto.randomUUID() via globalThis.crypto; hops default 2; visited []
  ```
- Produces (`service.ts`):

  ```ts
  export interface PeerServiceOptions {
    kb: KB;
    peers?: Peer[] | (() => Peer[]);
    maxHops?: number;
    timeoutMs?: number;
    modes?: Record<string, ResolutionMode>;
    log?: (entry: Record<string, unknown>) => void;
  }
  export interface PeerService extends Peer {
    readonly kb: KB;
  }
  export function createPeerService(opts: PeerServiceOptions): PeerService; // name = simpDoc(kb.graph)?.name ?? ""
  export function toLookupNode(
    kb: KB,
    id: string,
    body: boolean,
  ): LookupNode | undefined;
  ```

  `fields` = `node.data` minus the common keys listed in `tools/core.ts` `COMMON_KEYS`, but keeping edge kinds (consumers need refs). Edges come from `graph.out`/`graph.in`.

- [ ] **Step 1: Write failing tests** in `packages/core/test/peer-service.test.ts` (build KBs with `createKB(memorySource({...}))`):
  - `"manifest reflects simp.md"`: `protocol 1`, `name`, `serves ["pull"]`, `peers ["crm"]`, `errors 0`.
  - `"explore returns local hits with sources"`: query matching one goal → `hits[0].id === "goal.a"`, `sources` deep-equals `[{simp: "<name>", ok: true, ms: <number>}]` (assert `ok` and `simp` only).
  - `"lookup returns nodes with fields and edges and reports missing ids"`: `ids: ["procedure.a", "procedure.nope"]` → `nodes[0].fields.preconditions` deep-equals the frontmatter, `out` contains `{kind:"preconditions", to:"state.x"}`, `missing` deep-equals `["procedure.nope"]`; `body` absent unless `body: true`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `protocol.ts` and `createPeerService` without forwarding (peers ignored in this task).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add federation protocol and single-KB peer service"`

### Task 4: Forwarding, trace, merging, and spoofing protection

**Files:**

- Create: `packages/core/src/federation/merge.ts`
- Modify: `packages/core/src/federation/service.ts`
- Test: `packages/core/test/peer-mesh.test.ts`

**Interfaces:**

- Consumes: Task 3 types; `ids.ts` (`qualify`, `localize`, `parseRef`).
- Produces (`merge.ts`):
  ```ts
  export function qualifyResponse<T extends ExploreResponse | LookupResponse>(
    res: T,
    peer: string,
    own: string,
  ): T; // qualifies every id/ref/edge from the peer's view; localizes refs to `own`
  export function acceptedOwners(
    peer: string,
    sources: SourceStatus[],
  ): Set<string>; // {peer} ∪ ok sources
  export function mergeExplore(
    local: ExploreResponse,
    remote: ExploreResponse[],
    localGraph: KBGraph | undefined,
    opts: { limit: number; goalLimit: number; minRelevance: number },
  ): ExploreResponse;
  ```
  Merge rule: remote relevance × `0.9`; dedupe by id keeping the highest; local goals surfaced for remote hits via `goalsOf(localGraph, hit.id)` with score `hit.relevance × 0.6^hops`; sort by relevance desc, local first on ties; then `minRelevance` (0.05), `limit` (10, or request `limit`), `goalLimit` (5).
- Behavior in `createPeerService`:
  - Effective hops = `min(trace.hops, maxHops ?? 2)`. Forward only when hops > 0, to peers whose `name` is not in `visited`; forwarded trace = `{requestId, hops: hops - 1, visited: [...visited, own]}`.
  - Every peer call is raced against `timeoutMs ?? 2000`; failure → `{simp, ok:false, error, ms}`; never rejects.
  - `lookup`: unqualified ids answered locally; `crm:` ids forwarded to peer `crm` if it is a direct peer, otherwise reported in `missing`; ids qualified with `own` are localized first.
  - A peer error `unauthorized` is logged at most once per peer per 60 s (`{msg: "peer unauthorized", peer}`); other failures log every time.
  - Spoofing: drop nodes/hits whose owner (`parseRef(id).simp ?? peer`) is not in `acceptedOwners`, and log `{msg: "rejected node", peer, id}`.

- [ ] **Step 1: Write failing tests** in `packages/core/test/peer-mesh.test.ts` with three in-memory services X (peers Y), Y (peers CRM), CRM:
  - `"explore merges hits across the mesh with qualified ids"`: a query that matches only CRM's goal returns `crm:goal.c` from X; `sources` lists `x`, `y`, `crm` all ok.
  - `"local hits win ties"`: identical documents in X and Y → X's id ranks first.
  - `"hop limit stops forwarding"`: `newTrace(1)` from X → no `crm:` hits and no `crm` source.
  - `"visited prevents loops"`: X↔Y peers each other (use `peers: () => [...]`); explore returns once with each source listed once.
  - `"local goals surface for remote hits"`: X has `goal.g` → `procedures: [procedure.p]`, and `procedure.p` has `preconditions: [crm:state.c]`; a query matching only `crm:state.c`'s title returns `goal.g` in `goals` with `via` containing `{id: "crm:state.c"}`.
  - `"lookup forwards qualified ids to the owning peer"`: X `lookup(["y:procedure.b"])` returns node with `id: "y:procedure.b"` and `fields.requires` deep-equals `["y:procedure.c"]` (qualified from Y's view).
  - `"lookup through an intermediate simp"`: Y `lookup(["crm:state.c"])` from X via `y` returns `crm:state.c`.
  - `"slow peer becomes a failed source"`: peer whose `explore` never resolves, `timeoutMs: 50` → response arrives, `sources` contains `{simp:"slow", ok:false}`.
  - `"spoofed nodes are rejected"`: fake peer `y` returning `billing:goal.z` with sources `[y ok]` → hit absent.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** `merge.ts` and forwarding in `service.ts`.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Forward explore and lookup across peers"`

### Task 5: `createFederatedKB` (search, node, nodes, status)

**Files:**

- Create: `packages/core/src/federation/kb.ts`
- Test: `packages/core/test/federated-kb.test.ts`

**Interfaces:**

- Consumes: `createPeerService`, `mergeExplore`, protocol types.
- Produces:

  ```ts
  export type FederatedKBOptions =
    | {
        local: KB;
        peers?: Peer[];
        hops?: number;
        timeoutMs?: number;
        modes?: Record<string, ResolutionMode>;
      }
    | { home: Peer; hops?: number };
  export interface FederatedStatus extends KBStatus {
    simp?: string;
  }
  export interface FederatedSearchResult extends SearchResult {
    sources: SourceStatus[];
  }
  export interface FederatedKB {
    readonly local?: KB;
    readonly status: FederatedStatus;
    search(
      query: string,
      opts?: { types?: NodeType[]; limit?: number },
    ): Promise<FederatedSearchResult>;
    node(id: string): Promise<LookupNode | undefined>; // body included
    nodes(
      ids: string[],
      opts?: { body?: boolean },
    ): Promise<Map<string, LookupNode>>; // batched; body only when requested
    resolveGoal(id: string, opts?: ResolveOptions): Promise<ResolvedGoal>;
    resolveProcedure(id: string, opts?: ResolveOptions): Promise<ResolvedGoal>;
    render(resolved: ResolvedGoal, opts?: RenderOptions): Promise<RenderResult>;
    peers(): Promise<SourceStatus[]>; // manifest health per direct peer
  }
  export async function createFederatedKB(
    opts: FederatedKBOptions,
  ): Promise<FederatedKB>;
  export function isFederatedKB(value: unknown): value is FederatedKB; // Symbol.for("simplink.federated-kb")
  ```

  `home` mode: no local KB; `status` built from `home.manifest()` (`nodes`/`edges` 0, `errors` from manifest, `root` = peer name); search/lookup go to `home` with ids left unqualified (home is transparent). `render` uses `renderResolvedGoal` (or `local`'s configured renderer). In this task `resolveGoal`/`resolveProcedure` delegate to `local.resolveGoal` and throw `"<id> is not a goal node"` in home mode; Task 6 replaces them.

- [ ] **Step 1: Write failing tests**:
  - `"local-only federated KB matches kb.search ids"`: `createFederatedKB({local})` search ids equal `local.search` ids for the same query.
  - `"node returns local and remote nodes"`: `node("goal.a")` and `node("crm:goal.c")` both defined; `node("crm:goal.none")` undefined.
  - `"home mode keeps the home simp's ids unqualified"`: `createFederatedKB({home: serviceY})` search returns `procedure.b` (not `y:procedure.b`) and `crm:` ids for CRM.
  - `"status reports the simp name and peer health"`: `status.simp === "x"`; `peers()` returns `[{simp:"y", ok:true}]`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add federated KB facade"`

### Task 6: Pull resolution (prefetch + overlay)

**Files:**

- Create: `packages/core/src/federation/prefetch.ts`
- Modify: `packages/core/src/federation/kb.ts` (`resolveGoal`, `resolveProcedure`)
- Test: `packages/core/test/federated-resolve.test.ts`

**Interfaces:**

- Consumes: `FederatedKB.nodes`, `resolveGoal`/`resolveProcedure` from `resolve.ts` (unchanged), `defaultAvailability`.
- Produces:
  ```ts
  export function toKBNode(n: LookupNode): KBNode; // path = `simp://${simp}/${id}` for remote ids, data = fields, body = body ?? ""
  export async function prefetch(
    target: string,
    local: KBGraph | undefined,
    fetch: (ids: string[]) => Promise<Map<string, LookupNode>>,
    maxDepth: number,
  ): Promise<{ graph: KBGraph; warnings: string[] }>;
  ```
  Algorithm: frontier = refs of the target (fetched first if not local); each round collects refs from `EDGE_KINDS` fields except `related`, `produces`, and from `choices[].options[].procedure`; ids not in `local` and not yet fetched are fetched in one `nodes(ids, { body: true })` call; stop when no new ids or after `maxDepth` (8) rounds. Overlay graph = `{...local, nodes: new Map([...local.nodes, ...fetched])}` (the resolver reads only `nodes`). Unfetchable ids add `unreachable node "<id>"` warnings; the resolver then emits its usual missing-node warning.
- `resolveGoal` in `FederatedKB`: overlay + `resolveGoal(overlay, id, {...opts, availability: (n,t) => isQualified(n.id) ? [] : (opts.availability ?? defaultAvailability)(n,t)})`; append prefetch warnings and one `availability of <id> not checked` per remote procedure in each alternative's plan whose node has `availability`.

- [ ] **Step 1: Write failing tests** (X procedure `procedure.send` with `preconditions: [crm:state.imported]`; CRM `state.imported` satisfied by `procedure.import` with `requires: [procedure.login]`):
  - `"plan includes remote check and satisfier steps"`: build the same documents as one local KB (no prefixes) and resolve with `resolveProcedure`; `sig()` of the federated plan equals that local `sig()` with every CRM id prefixed `crm:` (so the expectation follows the existing resolver's ordering), and it contains `check:crm:state.imported` and `run:procedure.send`.
  - `"known remote state skips the check"`: `states: {"crm:state.imported": true}` → plan `["run:procedure.send"]`.
  - `"unreachable peer degrades to warnings"`: peer that fails lookup → plan still contains `run:procedure.send` and `warnings` contains `unreachable node "crm:state.imported"`.
  - `"remote availability is not checked"`: CRM procedure with `availability: {plans: [pro]}` → `warnings` contains `availability of crm:procedure.import not checked`; alternative `available` is not false.
  - `"resolves a remote goal id from a search hit"`: `resolveGoal("crm:goal.import")` returns `goal.id === "crm:goal.import"` with one alternative. _(Review Focus 5)_
  - `"own nodes returned through the mesh are not refetched"`: Y references `x:procedure.helper` (X's own) → the plan uses `procedure.helper` and the lookup spy never receives `x:procedure.helper`. _(Review Focus 4)_
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Resolve plans across simps by pulling remote nodes"`

### Task 7: Delegate resolution and mode selection

**Files:**

- Modify: `packages/core/src/federation/service.ts` (add `resolve` when `serves` includes `delegate`), `packages/core/src/federation/prefetch.ts`, `packages/core/src/federation/kb.ts`
- Test: `packages/core/test/federated-delegate.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export function selectMode(
    preferred: ResolutionMode | undefined,
    serves: ResolutionMode[],
  ): ResolutionMode | undefined; // preferred if served, else pull if served, else delegate if served, else undefined
  export function fragmentNode(id: string, res: ResolveResponse): KBNode; // type "procedure"; title/summary from res.resolved.goal; body = "## Steps\n" + top alternative steps flattened (string steps of each run step in order, check steps as "Check <state title>: <how>"); data = { produces: res.produces }
  ```

  `prefetch` gains `resolveRemote?: (id: string) => Promise<ResolveResponse | undefined>`, called instead of fetching for a `procedure.*` ref owned by a direct peer whose selected mode is `delegate`; the response's `resolved.warnings` and the top alternative's warnings are added to the result warnings. Choices for the delegated call: entries of `opts.choices` whose key starts with `<simp>:`, with that prefix stripped. States: `opts.states` entries for that simp, prefix stripped.
  - Mode per direct peer: `modes[peer]` (from `simp.md` `peers[].mode`) through `selectMode` with `manifest().serves`. Indirect simps always pull. No mode → the ref is left unfetched (resolver missing-node warning).
  - Service `resolve`: localize target, run `kb.resolveGoal` or `kb.resolveProcedure` by type, `produces` = union of `produces` of every run step's procedure in the top alternative.

- [ ] **Step 1: Write failing tests**:
  - `selectMode` table: `("delegate", ["pull","delegate"]) → "delegate"`; `("delegate", ["pull"]) → "pull"`; `(undefined, ["delegate"]) → "delegate"`; `("pull", []) → undefined`.
  - `"delegated procedure becomes one fragment step"`: CRM serves `[pull, delegate]`, X mode `delegate`; X procedure `requires: [crm:procedure.import]` → plan has `run:crm:procedure.import` and its steps include CRM's login and import step text; CRM lookup spy received no `procedure.*` ids.
  - `"fragment produces satisfy later preconditions"`: X procedure requires `crm:procedure.import` then has precondition `crm:state.imported` → no `check:crm:state.imported` in the plan.
  - `"choices pass through with the simp prefix stripped"`: CRM `procedure.import` choice `source` with options `csv`/`api`; `choices: {"crm:source": "api"}` → fragment steps contain the `api` option's step text.
  - `"service without delegate exposes no resolve"`: `createPeerService` for a KB with `serves: [pull]` → `service.resolve === undefined`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Support delegated resolution between simps"`

### Task 8: Tools on `FederatedKB`

**Files:**

- Modify: `packages/core/src/tools/core.ts`
- Modify: `packages/core/test/tools.test.ts`, `packages/core/test/extensions.test.ts` (custom-tool handler signature)
- Test: `packages/core/test/tools-federated.test.ts`

**Interfaces:**

- Consumes: `FederatedKB`, `createFederatedKB`, `isFederatedKB`.
- Produces:
  - `createKBTools(input: string | DocSource | KB | FederatedKB, opts)`; non-federated inputs are wrapped with `createFederatedKB({ local })` (no peers). `extensions` with a `KB` or `FederatedKB` input still throws.
  - `KBToolSpec.handler(args: unknown, kb: FederatedKB)`; `KBToolsOptions.tools?: (defaults: KBToolSpec[], kb: FederatedKB) => KBToolSpec[]`.
  - `KBTools.status: FederatedStatus`.
  - `search_kb` hits add `simp: parseRef(id).simp` when qualified.
  - `get_node` uses `kb.node(id)`; `get_related` BFS uses one `kb.nodes(frontier)` call per depth level (no body).
  - `requireNode` uses `kb.node` and federated search for suggestions; query derivation strips the `<simp>:` prefix.
  - `resolveProps.choices.description` adds `or {"<simp>:<choiceId>": "<optionKey>"} for another product`.

- [ ] **Step 1: Write failing tests** in `tools-federated.test.ts` (X with peer CRM in memory):
  - `"search_kb returns remote hits with simp"`: JSON hit `{id:"crm:goal.c", simp:"crm"}`.
  - `"get_node accepts qualified ids"`: `id: "crm:state.c"` → JSON `id` is `crm:state.c` and `out.satisfied_by` deep-equals `["crm:procedure.c"]`.
  - `"get_related crosses simps"`: from `procedure.send` depth 2 → nodes include `crm:state.imported` and `crm:procedure.import`.
  - `"resolve_goal includes federation warnings"`: with a failing peer, content contains `unreachable node`.
  - `"unknown remote id suggests similar ids"`: `crm:goal.importt` → error contains `Did you mean: crm:goal.import`.
  - Existing `tools.test.ts` passes unchanged except the custom-tool test now reads `kb.local!.graph`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm --filter @sontx/simplink-core test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Run KB tools on the federated KB"`

---

## Phase C — `@sontx/simplink-node`

### Task 9: Package scaffold, HTTP handler, and auth

**Files:**

- Create: `packages/node/package.json` (name `@sontx/simplink-node`, version `0.2.0`, `type: module`, bin `simp-node: dist/bin.js`, deps `@sontx/simplink-core: workspace:^`, `ajv: 8.17.1`, scripts copied from `packages/mcp/package.json`), `packages/node/tsconfig.json` (copy of mcp's), `packages/node/test/tsconfig.json` (copy of mcp's), `packages/node/LICENSE` (copy), `packages/node/src/http.ts`, `packages/node/src/index.ts`
- Modify: `tsconfig.json` (root references add `./packages/node` before mcp), `AGENTS.md` (package list and test command)
- Test: `packages/node/test/http.test.ts`

**Interfaces:**

- Consumes: `createPeerService`, protocol types.
- Produces:

  ```ts
  export interface SimpNodeHandlerOptions {
    service: PeerService;
    basePath?: string;
    token?: string;
    maxBodyBytes?: number;
    allowedHosts?: string[];
    allowedOrigins?: string[];
    onRequest?: (e: Record<string, unknown>) => void;
  }
  export function createSimpNodeHandler(
    opts: SimpNodeHandlerOptions,
  ): (req: IncomingMessage, res: ServerResponse) => void;
  ```

  Routes under `basePath` (default `/simp`): `GET /v1/manifest`, `POST /v1/explore|lookup|resolve`; `GET /healthz` at the server root returns `{ok:true, kb: status without root, peers}`. Request bodies validated with Ajv schemas derived from the protocol types (400 `{error, details}`); unknown route 404; wrong method 405; `/v1/resolve` 404 when `service.resolve` is undefined; token set and header missing/wrong → 401 `{error:"unauthorized"}` (compare with `crypto.timingSafeEqual` on equal-length buffers); `maxBodyBytes` default `1000000` → 413. Host/Origin checks match `packages/mcp/src/http.ts` behavior.

- [ ] **Step 1: Write failing tests** (start `createServer(handler)` on port 0 with a fixture KB):
  - `"serves the manifest"`, `"explore returns hits"`, `"lookup returns nodes"` — status 200 and key fields.
  - `"requires the token when configured"`: no header → 401; `Bearer wrong` → 401; correct → 200; `/healthz` without header → 200.
  - `"no auth by default"`: no token configured → 200 without header.
  - `"rejects invalid bodies"`: `POST /v1/explore` with `{}` → 400.
  - `"resolve is absent unless delegate is served"`: 404.
  - `"unknown routes and methods"`: `GET /simp/v1/explore` → 405; `/simp/v2/x` → 404.
- [ ] **Step 2: Run** `pnpm install && pnpm --filter @sontx/simplink-node test` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS; `pnpm build` succeeds.
- [ ] **Step 5: Commit** `git commit -m "Add simplink-node HTTP peer API"`

### Task 10: `httpPeer` client

**Files:**

- Create: `packages/node/src/http-peer.ts`
- Test: `packages/node/test/http-peer.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface HttpPeerOptions {
    name: string;
    token?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
    now?: () => number;
  }
  export function httpPeer(baseUrl: string, opts: HttpPeerOptions): Peer;
  ```

  `manifest()` cached 60 s (via `now`); `resolve` present on the returned object but rejects with `peer "<name>" does not serve delegate` when the cached manifest lacks it; `Authorization: Bearer` when `token`; `AbortSignal.timeout(timeoutMs ?? 2000)`; non-2xx → rejects with `HTTP <status>` (401 → `unauthorized`); non-JSON or shape mismatch (missing `hits`/`nodes`/`resolved` arrays/objects) → rejects with `invalid response`; manifest `protocol !== 1` → rejects with `unsupported protocol <n>`; manifest `name !== opts.name` → rejects with `peer name mismatch: expected <a>, got <b>`.

- [ ] **Step 1: Write failing tests** (against a real `createSimpNodeHandler` server, plus a stub `fetch` for error cases):
  - `"round-trips explore and lookup"`, `"sends the bearer token"`, `"caches the manifest for 60 seconds"` (fake `now`, second call within 59 s makes no request, after 61 s does).
  - `"rejects malformed responses"`: stub returns 200 `text/html` → `invalid response`. _(Review Focus 1)_
  - `"rejects a peer whose manifest name differs"` → `peer name mismatch`. _(Review Focus 2)_
  - `"rejects unsupported protocol"`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add HTTP peer client"`

### Task 11: `simp-node` bin, peer config, online lint, and mesh tests

**Files:**

- Create: `packages/node/src/config.ts`, `packages/node/src/lint-peers.ts`, `packages/node/src/bin.ts`
- Create: `test/fixtures/mesh/zalo-oa/`, `test/fixtures/mesh/crm/`, `test/fixtures/mesh/hub/` (each with `simp.md`; zalo-oa peers `crm`; hub peers `zalo-oa`, `crm` and only `simp.md`; crm serves `[pull, delegate]`)
- Test: `packages/node/test/config.test.ts`, `packages/node/test/mesh.test.ts`, `packages/node/test/bin.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface PeerOverrides {
    urls: Record<string, string>;
    tokens: Record<string, string>;
  }
  export function parsePeerOverrides(
    flags: { peer: string[]; "peer-token": string[] },
    env: NodeJS.ProcessEnv,
  ): PeerOverrides; // SIMP_PEERS "a=url,b=url"; SIMP_PEER_TOKEN_<NAME> where NAME = name.toUpperCase().replaceAll("-", "_"); flags win over env
  export function loadPeerConfig(
    doc: SimpDoc,
    overrides: PeerOverrides,
    opts: { timeoutMs: number },
  ): {
    peers: Peer[];
    modes: Record<string, ResolutionMode>;
    skipped: string[];
  }; // a peer with no URL after overrides is skipped
  export async function lintPeers(kb: KB, peers: Peer[]): Promise<Issue[]>; // E007 missing, E003 wrong type (remote node type ≠ ref type prefix), W109 `peer "<name>" unreachable: <error>` once per peer
  ```

  Bin `simp-node [serve]` flags/env exactly as spec §7 table (`--kb`/`KB_DIR`/`kb`, `--host`/`HOST`/`127.0.0.1`, `--port`/`PORT`/`3393`, `--base-path`/`SIMP_BASE_PATH`/`/simp`, `--token`/`SIMP_TOKEN`, `--peer` repeatable/`SIMP_PEERS`, `--peer-token` repeatable/`SIMP_PEER_TOKEN_<NAME>`, `--max-hops` `2`, `--peer-timeout` `2000`, `--allowed-host`/`ALLOWED_HOSTS`, `--allowed-origin`/`ALLOWED_ORIGINS`, `--help`). Exit 2 with a message (no stack) on bad args or when the KB has no `simp.md`: `KB at <path> has no simp.md; a simp node needs a name`. Logs JSON lines like `packages/mcp/src/http-bin.ts`. Same keep-alive and shutdown handling. `simp-node lint --peers <kb>` prints issues in the `simp-lint` format and exits 1 on errors.

- [ ] **Step 1: Write failing tests**:
  - config: `"flags override env and simp.md urls"`, `"token env names uppercase and underscore"` (`zalo-oa` → `SIMP_PEER_TOKEN_ZALO_OA`), `"peers without a url are skipped"`.
  - mesh (three real servers on port 0 from the fixtures; hub's peer URLs set via overrides): `"hub search returns hits from both products"`, `"zalo-oa plan pulls crm steps"`, `"zalo-oa plan delegates to crm when configured"`, `"forwarding reaches crm through zalo-oa"` (hub with only zalo-oa peer finds `crm:` hits), `"one peer down still answers"` (close crm server → hub search ok, `sources` has crm `ok:false`).
  - lint: `"lintPeers reports missing remote nodes and unreachable peers"`.
  - bin: `"exits 2 without simp.md"`, `"--help prints usage"`, spawned via `process.execPath` + `tsx` relative to the test file.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm build && pnpm --filter @sontx/simplink-node test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Add simp-node server, peer config, and online lint"`

---

## Phase D — MCP

### Task 12: MCP standalone federation and peer mode

**Files:**

- Create: `packages/mcp/src/kb-source.ts`
- Modify: `packages/mcp/package.json` (dep `@sontx/simplink-node: workspace:^`), `packages/mcp/src/bin.ts`, `packages/mcp/src/http-bin.ts`, `packages/mcp/src/server.ts:7-11` (`SERVER_INSTRUCTIONS`), `packages/mcp/src/http.ts` (`/healthz` adds `peers`)
- Test: `packages/mcp/test/modes.test.ts`

**Interfaces:**

- Consumes: `createKB`, `createFederatedKB`, `simpDoc`, `httpPeer`, `loadPeerConfig`, `parsePeerOverrides`.
- Produces:

  ```ts
  export interface KBSourceArgs {
    kb?: string;
    simp?: string;
    simpToken?: string;
    noPeers: boolean;
    peer: string[];
    peerToken: string[];
    peerTimeout: number;
  }
  export async function openFederatedKB(
    args: KBSourceArgs,
    env: NodeJS.ProcessEnv,
  ): Promise<FederatedKB>; // throws ArgumentError("--kb and --simp cannot be used together")
  export class ArgumentError extends Error {}
  ```

  Standalone: `createKB(path.resolve(kb ?? env.KB_DIR ?? "kb"))`; peers from `simp.md` unless `noPeers`. Peer mode: `createFederatedKB({ home: httpPeer(simp, { name: (await manifest).name, token: simpToken ?? env.SIMP_TOKEN }) })` — fetch the manifest once with a provisional name to learn the real name. Both bins add flags `--simp`, `--simp-token`, `--no-peers`, `--peer`, `--peer-token`, `--peer-timeout`; bad combinations exit 2 like today's argument errors. `SERVER_INSTRUCTIONS` gains the exact line from Global Constraints. `createKBTools(federatedKB, { tenantContext: false })` in the HTTP bin as today.

- [ ] **Step 1: Write failing tests**:
  - `"standalone mode federates declared peers"`: fixture KB with `simp.md` peer pointing at a running `simp-node` handler → `search_kb` via `createMcpServer` client returns a `crm:` hit.
  - `"--no-peers keeps results local"`.
  - `"peer mode serves the home simp's ids unqualified"`.
  - `"--kb with --simp is rejected"`: `openFederatedKB` rejects with `ArgumentError`; spawned `bin.ts` exits 2 without a stack trace.
  - `"healthz lists peers"`.
  - Existing `mcp.test.ts` and `http.test.ts` pass unchanged.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Let MCP federate peers or connect to a simp node"`

---

## Phase E — Knowledge base and authoring guidance

### Task 13: Document federation in `kb/` and the KB builder skill

**Files:**

- Create: `kb/simp.md` (name `simplink`, no peers, homepage linking entry goals with `simp:///` links)
- Create: KB nodes (paths follow existing `kb/` areas): `kb/goals/federation/link-products.md`, `kb/procedures/federation/write-simp-doc.md`, `kb/procedures/federation/reference-other-simp.md`, `kb/procedures/federation/run-simp-node.md`, `kb/procedures/mcp/connect-to-simp-node.md`, `kb/capabilities/federation/peer-api.md`, `kb/constraints/federation/mesh-limits.md` (hop limit 2, no tenant pass-through, remote availability not checked, optional auth)
- Modify: `kb/INVENTORY.md`, `kb/constraints/authoring/graph-rules.md` (E016, W109, `simp://` canonical, wikilinks supported), `.agents/skills/product-kb-builder/` schema reference and templates (`simp://` first, `simp.md` template)
- Test: `pnpm lint:kb`

**Interfaces:**

- Consumes: everything above; no code.

- [ ] **Step 1: Write the nodes** using `simp://` links in new bodies; do not rewrite existing wikilinks.
- [ ] **Step 2: Run** `pnpm build && pnpm lint:kb` — Expected: `0 error(s)`, no new warnings.
- [ ] **Step 3: Run** `pnpm exec tsx packages/core/src/search-cli.ts kb "link products"` — Expected: `goal.federation.link-products` first.
- [ ] **Step 4: Run** `pnpm lint && pnpm test` — Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Document simp federation in the Simplink KB"`

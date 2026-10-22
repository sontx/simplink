import type { Availability, EdgeKind, NodeType } from "../types.js";
import type { GoalHit, SearchHit } from "../search.js";
import type { ResolvedGoal } from "../resolve.js";

/** Version of the simp peer protocol this package speaks. */
export const PROTOCOL_VERSION = 1;

/**
 * How a consumer resolves another simp's nodes: `pull` fetches the nodes and
 * plans locally, while `delegate` asks the owner for a resolved plan fragment.
 */
export type ResolutionMode = "pull" | "delegate";

/** A simp's self-description, answered by `GET /v1/manifest`. */
export interface SimpManifest {
  /** Protocol version; see {@link PROTOCOL_VERSION}. */
  protocol: number;
  /** Simp name used in qualified references. */
  name: string;
  /** Product title. */
  title: string;
  /** Product summary. */
  summary: string;
  /** Product tags. */
  tags: string[];
  /** Resolution modes this simp serves. */
  serves: ResolutionMode[];
  /** Root of the product's published docs. */
  docs_url?: string;
  /** Names of declared peers. */
  peers: string[];
  /** Lint error count of the loaded KB. */
  errors: number;
}

/** Forwarding state carried by every request to bound fan-out and stop loops. */
export interface Trace {
  /** Request ID shared by every hop, for logs. */
  requestId: string;
  /** Remaining forwarding hops; `0` answers locally only. */
  hops: number;
  /** Simps already visited; they are not asked again. */
  visited: string[];
}

/** Outcome of asking one simp, reported in every response. */
export interface SourceStatus {
  /** Simp that was asked. */
  simp: string;
  /** Whether it answered. */
  ok: boolean;
  /** Failure message, such as `timeout` or `unauthorized`. */
  error?: string;
  /** Time taken in milliseconds. */
  ms: number;
}

/** Search request; fields match the local search options. */
export interface ExploreRequest {
  /** Free-text query. */
  query: string;
  /** Node types to return. */
  types?: NodeType[];
  /** Maximum hits. */
  limit?: number;
  /** Maximum goal suggestions. */
  goalLimit?: number;
  /** Minimum relevance for hits and goals. */
  minRelevance?: number;
  /** Forwarding state. */
  trace: Trace;
}

/** Merged search results; IDs from other simps are qualified. */
export interface ExploreResponse {
  /** Matching nodes. */
  hits: SearchHit[];
  /** Goals reachable from the matching nodes. */
  goals: GoalHit[];
  /** Every simp asked, including failures. */
  sources: SourceStatus[];
}

/** A node as transferred between simps. */
export interface LookupNode {
  /** Node ID; qualified when it belongs to another simp than the one answering. */
  id: string;
  /** Node type. */
  type: NodeType;
  /** Title. */
  title: string;
  /** Summary. */
  summary: string;
  /** Lifecycle status. */
  status: "active" | "deprecated";
  /** Alternative names. */
  aliases: string[];
  /** Tags. */
  tags: string[];
  /** Availability rules, when the node has any. */
  availability?: Availability;
  /** Remaining frontmatter fields, including relationship arrays. */
  fields: Record<string, unknown>;
  /** Markdown body; present only when requested. */
  body?: string;
  /** Outgoing edges. */
  out: { kind: EdgeKind; to: string }[];
  /** Incoming edges within the answering simp. */
  in: { kind: EdgeKind; from: string }[];
}

/** Fetches nodes by ID; qualified IDs are forwarded to their owners. */
export interface LookupRequest {
  /** Node IDs, local or qualified. */
  ids: string[];
  /** Whether to include Markdown bodies. */
  body?: boolean;
  /** Forwarding state. */
  trace: Trace;
}

/** Nodes found by a lookup. */
export interface LookupResponse {
  /** Nodes found. */
  nodes: LookupNode[];
  /** Requested IDs that no simp returned. */
  missing: string[];
  /** Every simp asked, including failures. */
  sources: SourceStatus[];
}

/** Every node of the answering simp itself, without bodies; never forwarded to peers. */
export interface ListResponse {
  /** All local nodes. */
  nodes: LookupNode[];
}

/** Asks a delegate-serving simp to resolve a goal or procedure. */
export interface ResolveRequest {
  /** Goal or procedure ID, local or qualified. */
  target: string;
  /** Known condition states by state ID. */
  states?: Record<string, boolean>;
  /** Selected choice options by `choice` or `procedure:choice` key. */
  choices?: Record<string, string>;
  /** Maximum plan depth. */
  maxDepth?: number;
  /** Forwarding state. */
  trace: Trace;
}

/** A resolved plan from a delegate-serving simp. */
export interface ResolveResponse {
  /** Resolved plan; nodes of other simps have qualified IDs. */
  resolved: ResolvedGoal;
  /** States the plan produces, so the caller can skip repeated checks. */
  produces: string[];
  /** Every simp asked, including failures. */
  sources: SourceStatus[];
}

/**
 * A simp that answers protocol requests: an in-process peer service, or a
 * client such as `httpPeer` from `@sontx/simplink-node`.
 */
export interface Peer {
  /** Simp name; may be empty until the first manifest is fetched. */
  name: string;
  /** Returns the simp's manifest. */
  manifest(): Promise<SimpManifest>;
  /** Searches this simp and, within the trace's hops, its peers. */
  explore(r: ExploreRequest): Promise<ExploreResponse>;
  /** Fetches nodes, forwarding qualified IDs to their owners. */
  lookup(r: LookupRequest): Promise<LookupResponse>;
  /** Resolves a plan; present only when the simp serves `delegate`. */
  resolve?(r: ResolveRequest): Promise<ResolveResponse>;
  /** Lists every local node; absent on peers that cannot enumerate. */
  list?(): Promise<ListResponse>;
}

/** Starts a request trace with a fresh ID and `hops` forwarding hops (default `2`). */
export function newTrace(hops = 2): Trace {
  return { requestId: globalThis.crypto.randomUUID(), hops, visited: [] };
}

import type { Availability, EdgeKind, NodeType } from "../types.js";
import type { GoalHit, SearchHit } from "../search.js";
import type { ResolvedGoal } from "../resolve.js";

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
  goalLimit?: number;
  minRelevance?: number;
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
}

export interface Peer {
  name: string;
  manifest(): Promise<SimpManifest>;
  explore(r: ExploreRequest): Promise<ExploreResponse>;
  lookup(r: LookupRequest): Promise<LookupResponse>;
  resolve?(r: ResolveRequest): Promise<ResolveResponse>;
}

export function newTrace(hops = 2): Trace {
  return { requestId: globalThis.crypto.randomUUID(), hops, visited: [] };
}

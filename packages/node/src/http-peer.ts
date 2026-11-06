import type {
  Peer,
  SimpManifest,
  ExploreResponse,
  ListResponse,
  LookupResponse,
  ResolveResponse,
} from "@sontx/simplink-core/browser";
/** Options for {@link httpPeer}. */
export interface HttpPeerOptions {
  /** Expected simp name; a manifest with another name is rejected. */
  name?: string;
  /** Bearer token sent with every request. */
  token?: string;
  /** Per-request timeout in milliseconds. Defaults to `2000`. */
  timeoutMs?: number;
  /** Replaces the global `fetch`, for example in tests. */
  fetch?: typeof fetch;
  /** Clock used for the 60-second manifest cache. */
  now?: () => number;
  /** Largest response body accepted, in bytes. Defaults to `20000000`. */
  maxResponseBytes?: number;
}
import {
  object,
  hits,
  goals,
  nodes,
  sources,
  resolved,
  strings,
} from "./wire.js";
/**
 * Connects to a running simp node's peer API. Works in Node.js and browsers
 * (import `@sontx/simplink-node/http-peer` in browser bundles). Responses are
 * validated, and the manifest is cached for 60 seconds.
 *
 * @param baseUrl - Peer API base URL including the base path, such as `http://127.0.0.1:3393/simp`.
 */
export function httpPeer(baseUrl: string, opts: HttpPeerOptions = {}): Peer {
  let name = opts.name ?? "",
    cached: SimpManifest | undefined,
    expires = 0;
  const now = opts.now ?? Date.now;
  const request = async (
    route: string,
    body?: unknown,
  ): Promise<Record<string, unknown>> => {
    const response = await (opts.fetch ?? fetch)(
      `${baseUrl.replace(/\/$/, "")}/v1/${route}`,
      {
        method: body === undefined ? "GET" : "POST",
        redirect: "manual",
        headers: {
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
      },
    );
    if (!response.ok)
      throw new Error(
        response.status === 401 ? "unauthorized" : `HTTP ${response.status}`,
      );
    // Read at most maxResponseBytes so a hostile peer cannot exhaust memory.
    const limit = opts.maxResponseBytes ?? 20000000;
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          throw new Error("response too large");
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new Error("invalid response");
    }
    if (!object(value)) throw new Error("invalid response");
    return value;
  };
  const manifest = async (): Promise<SimpManifest> => {
    if (cached && now() < expires) return cached;
    const value = await request("manifest");
    if (
      typeof value.protocol !== "number" ||
      typeof value.name !== "string" ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.name) ||
      !Array.isArray(value.serves) ||
      !value.serves.length ||
      !value.serves.every((x) => x === "pull" || x === "delegate") ||
      !Array.isArray(value.peers) ||
      !value.peers.every((x) => typeof x === "string") ||
      !Array.isArray(value.tags) ||
      !value.tags.every((x) => typeof x === "string") ||
      typeof value.title !== "string" ||
      typeof value.summary !== "string" ||
      typeof value.errors !== "number"
    )
      throw new Error("invalid response");
    if (value.protocol !== 1)
      throw new Error(`unsupported protocol ${value.protocol}`);
    if (name && value.name !== name)
      throw new Error(
        `peer name mismatch: expected ${name}, got ${value.name}`,
      );
    name = value.name;
    cached = value as unknown as SimpManifest;
    expires = now() + 60000;
    return cached;
  };
  return {
    get name() {
      return name;
    },
    manifest,
    async explore(req) {
      await manifest();
      const v = await request("explore", req);
      if (!hits(v.hits) || !goals(v.goals) || !sources(v.sources))
        throw new Error("invalid response");
      return v as unknown as ExploreResponse;
    },
    async lookup(req) {
      await manifest();
      const v = await request("lookup", req);
      if (!nodes(v.nodes) || !strings(v.missing) || !sources(v.sources))
        throw new Error("invalid response");
      return v as unknown as LookupResponse;
    },
    async list() {
      await manifest();
      const v = await request("nodes");
      if (!nodes(v.nodes)) throw new Error("invalid response");
      return v as unknown as ListResponse;
    },
    async resolve(req) {
      if (!(await manifest()).serves.includes("delegate"))
        throw new Error(`peer "${name}" does not serve delegate`);
      const v = await request("resolve", req);
      if (!resolved(v.resolved) || !strings(v.produces) || !sources(v.sources))
        throw new Error("invalid response");
      return v as unknown as ResolveResponse;
    },
  };
}

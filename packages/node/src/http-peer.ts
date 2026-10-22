import type {
  Peer,
  SimpManifest,
  ExploreResponse,
  LookupResponse,
  ResolveResponse,
} from "@sontx/simplink-core";
export interface HttpPeerOptions {
  name?: string;
  token?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
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
    let value: unknown;
    try {
      value = await response.json();
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

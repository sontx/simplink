import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { Ajv } from "ajv";
import {
  NODE_TYPES,
  createPeerService,
  newTrace,
  type PeerServiceOptions,
  type PeerService,
  type ExploreRequest,
  type LookupRequest,
  type ResolveRequest,
} from "@sontx/simplink-core";
export type SimpNodeHandlerOptions = (
  { service: PeerService } | PeerServiceOptions
) & {
  basePath?: string;
  token?: string;
  maxBodyBytes?: number;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  onRequest?: (e: Record<string, unknown>) => void;
};
const trace = {
  type: "object",
  required: ["requestId", "hops", "visited"],
  additionalProperties: false,
  properties: {
    requestId: { type: "string" },
    hops: { type: "integer", minimum: 0 },
    visited: { type: "array", items: { type: "string" } },
  },
};
const ajv = new Ajv({ allErrors: true });
const schemas = {
  explore: {
    query: { type: "string" },
    goalLimit: { type: "integer", minimum: 0 },
    minRelevance: { type: "number", minimum: 0 },
    types: { type: "array", items: { enum: [...NODE_TYPES] } },
    limit: { type: "integer", minimum: 1 },
    trace,
  },
  lookup: {
    ids: { type: "array", items: { type: "string" } },
    body: { type: "boolean" },
    trace,
  },
  resolve: {
    target: { type: "string" },
    states: { type: "object", additionalProperties: { type: "boolean" } },
    maxDepth: { type: "integer", minimum: 0 },
    choices: { type: "object", additionalProperties: { type: "string" } },
    trace,
  },
};
const validators = Object.fromEntries(
  Object.entries(schemas).map(([key, properties]) => [
    key,
    ajv.compile({
      type: "object",
      required: [
        key === "explore" ? "query" : key === "lookup" ? "ids" : "target",
        "trace",
      ],
      properties,
      additionalProperties: false,
    }),
  ]),
);
export function createSimpNodeHandler(
  opts: SimpNodeHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const service = "service" in opts ? opts.service : createPeerService(opts);
  return async (req, res) => {
    const started = performance.now();
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    res.on("finish", () =>
      opts.onRequest?.({
        method: req.method,
        path,
        status: res.statusCode,
        ms: Math.round(performance.now() - started),
      }),
    );
    const send = (status: number, body: unknown, allow?: string) =>
      res
        .writeHead(status, {
          "content-type": "application/json",
          ...(allow ? { allow } : {}),
        })
        .end(JSON.stringify(body));
    const forbidden =
      (opts.allowedHosts?.length &&
        !opts.allowedHosts.includes(req.headers.host ?? "")) ||
      (opts.allowedOrigins?.length &&
        req.headers.origin &&
        !opts.allowedOrigins.includes(req.headers.origin));
    const actual = Buffer.from(req.headers.authorization ?? ""),
      expected = Buffer.from(`Bearer ${opts.token}`);
    const authorized =
      !opts.token ||
      (actual.length === expected.length && timingSafeEqual(actual, expected));
    if (path === "/healthz") {
      if (req.method !== "GET") {
        send(405, { error: "method not allowed" }, "GET");
        return;
      }
      // Health stays public, but probing and listing peers requires the token.
      if (!authorized) {
        send(200, { ok: true, kb: { ...service.kb.status, root: undefined } });
        return;
      }
      const m = await service.manifest();
      const health = await service.explore({ query: "", trace: newTrace(1) });
      send(200, {
        ok: true,
        kb: { ...service.kb.status, root: undefined },
        peers: m.peers.map((name) => {
          const result = health.sources.find((s) => s.simp === name);
          return { name, ok: result?.ok ?? false, ms: result?.ms ?? 0 };
        }),
      });
      return;
    }
    const route = path.slice(
      (opts.basePath ?? "/simp").replace(/\/$/, "").length,
    );
    if (
      !path.startsWith(`${(opts.basePath ?? "/simp").replace(/\/$/, "")}/`) ||
      !["/v1/manifest", "/v1/explore", "/v1/lookup", "/v1/resolve"].includes(
        route,
      ) ||
      (route === "/v1/resolve" && !service.resolve)
    ) {
      send(404, { error: "not found" });
      return;
    }
    if (forbidden) {
      send(403, { error: "forbidden" });
      return;
    }
    if (!authorized) {
      send(401, { error: "unauthorized" });
      return;
    }
    const method = route === "/v1/manifest" ? "GET" : "POST";
    if (req.method !== method) {
      send(405, { error: "method not allowed" }, method);
      return;
    }
    try {
      if (method === "GET") {
        send(200, await service.manifest());
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const buffer = Buffer.from(chunk);
        size += buffer.length;
        if (size > (opts.maxBodyBytes ?? 1000000)) {
          send(413, { error: "body too large" });
          return;
        }
        chunks.push(buffer);
      }
      let body: unknown;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString());
      } catch {
        send(400, { error: "invalid JSON" });
        return;
      }
      const key = route.slice(4),
        validate = validators[key];
      if (!validate(body)) {
        send(400, { error: "invalid request", details: validate.errors });
        return;
      }
      const value =
        key === "explore"
          ? await service.explore(body as ExploreRequest)
          : key === "lookup"
            ? await service.lookup(body as LookupRequest)
            : await service.resolve!(body as ResolveRequest);
      send(200, value);
    } catch (error) {
      send(500, { error: (error as Error).message });
    }
  };
}

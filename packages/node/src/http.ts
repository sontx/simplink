import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import nodePath from "node:path";
import { Ajv } from "ajv";
import {
  NODE_TYPES,
  createPeerService,
  docAssets,
  newTrace,
  type PeerServiceOptions,
  type PeerService,
  type ExploreRequest,
  type LookupRequest,
  type ResolveRequest,
} from "@sontx/simplink-core";
/**
 * Options for {@link createSimpNodeHandler}: an existing peer service, or the
 * options to create one, plus HTTP settings.
 */
export type SimpNodeHandlerOptions = (
  { service: PeerService } | PeerServiceOptions
) & {
  /** Base path of the peer API. Defaults to `/simp`. */
  basePath?: string;
  /** Bearer token required on peer API routes; `/healthz` stays public but lists peers only with it. */
  token?: string;
  /** Maximum request body size in bytes. Defaults to `1000000`. */
  maxBodyBytes?: number;
  /** Host header allowlist; empty allows any host. `/healthz` is exempt. */
  allowedHosts?: string[];
  /** Origin allowlist; defaults to `https://simp.sontx.dev`. Other browser origins are refused. `*` allows any origin. */
  allowedOrigins?: string[];
  /**
   * KB folder that images are served from at `GET <base>/v1/assets/<path>`. Only images that node bodies
   * reference are served, and never a file outside the folder. Omit to serve no images.
   */
  assetRoot?: string;
  /** Called once per finished request with method, path, status, and duration. */
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
// Image types a KB body can reference; anything else is served as bytes.
const IMAGE_TYPES: Record<string, string> = {
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const ASSET_ROUTE = "/v1/assets/";
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
/**
 * Creates a `node:http` request handler that serves the simp peer API
 * (`manifest`, `nodes`, `explore`, `lookup`, and `resolve` when delegate is
 * served, and `assets/<path>` when `assetRoot` is set) under the base path, plus `GET /healthz`. Mount it on your own
 * server; use {@link startSimpNode} to load a KB and listen in one call.
 */
export function createSimpNodeHandler(
  opts: SimpNodeHandlerOptions,
): (req: IncomingMessage, res: ServerResponse) => void {
  const service = "service" in opts ? opts.service : createPeerService(opts);
  const allowedOrigins = opts.allowedOrigins ?? ["https://simp.sontx.dev"];
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
    // CORS only for origins on the allowlist (or `*`).
    const origin = req.headers.origin;
    const originAllowed = (o: string) =>
      allowedOrigins.some((a) => a === "*" || a === o);
    const cors: Record<string, string> =
      origin && originAllowed(origin)
        ? { "access-control-allow-origin": origin, vary: "origin" }
        : {};
    const send = (status: number, body: unknown, allow?: string) =>
      res
        .writeHead(status, {
          "content-type": "application/json",
          ...cors,
          ...(allow ? { allow } : {}),
        })
        .end(JSON.stringify(body));
    const forbidden =
      (opts.allowedHosts?.length &&
        !opts.allowedHosts.includes(req.headers.host ?? "")) ||
      (allowedOrigins.length && origin && !originAllowed(origin));
    const actual = Buffer.from(req.headers.authorization ?? ""),
      expected = Buffer.from(`Bearer ${opts.token}`);
    const authorized =
      !opts.token ||
      (actual.length === expected.length && timingSafeEqual(actual, expected));
    // An image a node body references, read from the KB folder; a symlink out of it is not served.
    const sendAsset = async (encoded: string) => {
      let rel: string;
      try {
        rel = decodeURIComponent(encoded);
      } catch {
        send(404, { error: "not found" });
        return;
      }
      const root = await realpath(opts.assetRoot!).catch(() => undefined);
      const file =
        root && docAssets(service.kb.graph).includes(rel)
          ? await realpath(nodePath.join(root, rel)).catch(() => undefined)
          : undefined;
      const info =
        file && file.startsWith(root + nodePath.sep)
          ? await stat(file).catch(() => undefined)
          : undefined;
      if (!info?.isFile()) {
        send(404, { error: "not found" });
        return;
      }
      res.writeHead(200, {
        "content-type":
          IMAGE_TYPES[nodePath.extname(file!).toLowerCase()] ??
          "application/octet-stream",
        "content-length": String(info.size),
        // An SVG opened directly runs no script and cannot read the node's origin.
        "content-security-policy": "sandbox",
        "x-content-type-options": "nosniff",
        "cache-control": "no-cache",
        ...cors,
      });
      createReadStream(file!)
        .on("error", () => res.destroy())
        .pipe(res);
    };
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
      ((![
        "/v1/manifest",
        "/v1/nodes",
        "/v1/explore",
        "/v1/lookup",
        "/v1/resolve",
      ].includes(route) ||
        (route === "/v1/resolve" && !service.resolve)) &&
        !(opts.assetRoot && route.startsWith(ASSET_ROUTE)))
    ) {
      send(404, { error: "not found" });
      return;
    }
    if (forbidden) {
      send(403, { error: "forbidden" });
      return;
    }
    const method =
      route === "/v1/manifest" ||
      route === "/v1/nodes" ||
      route.startsWith(ASSET_ROUTE)
        ? "GET"
        : "POST";
    // Preflights carry no credentials, so answer them before the token check.
    if (req.method === "OPTIONS" && cors["access-control-allow-origin"]) {
      res
        .writeHead(204, {
          ...cors,
          "access-control-allow-methods": method,
          "access-control-allow-headers": "authorization, content-type",
          "access-control-max-age": "600",
        })
        .end();
      return;
    }
    if (!authorized) {
      send(401, { error: "unauthorized" });
      return;
    }
    if (req.method !== method) {
      send(405, { error: "method not allowed" }, method);
      return;
    }
    try {
      if (route.startsWith(ASSET_ROUTE)) {
        await sendAsset(route.slice(ASSET_ROUTE.length));
        return;
      }
      if (method === "GET") {
        send(
          200,
          route === "/v1/nodes"
            ? await service.list()
            : await service.manifest(),
        );
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

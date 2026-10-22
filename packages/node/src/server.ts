import { createServer, type Server } from "node:http";
import path from "node:path";
import {
  createKB,
  createPeerService,
  simpDoc,
  type KB,
  type KBStatus,
  type PeerService,
} from "@sontx/simplink-core";
import { createSimpNodeHandler } from "./http.js";
import { loadPeerConfig, type PeerOverrides } from "./config.js";

/**
 * Options for {@link startSimpNode}. Every option has the same default as the
 * matching `simp-node` flag.
 */
export interface SimpNodeOptions {
  /** KB folder path or an already loaded KB; the KB must have a root `simp.md`. Defaults to `kb`. */
  kb?: string | KB;
  /** Interface to listen on. Defaults to `127.0.0.1`. */
  host?: string;
  /** Port to listen on; `0` picks a free port. Defaults to `3393`. */
  port?: number;
  /** Base path of the peer API. Defaults to `/simp`. */
  basePath?: string;
  /** Bearer token required on peer API routes. Omit to serve them without auth. */
  token?: string;
  /** Peer URL and token overrides by peer name, applied over `simp.md` declarations. */
  peerOverrides?: Partial<PeerOverrides>;
  /** Maximum forwarding hops for searches, lookups, and resolves. Defaults to `2`. */
  maxHops?: number;
  /** Per-peer request timeout in milliseconds. Defaults to `2000`. */
  timeoutMs?: number;
  /** Host header allowlist; empty allows any host. */
  allowedHosts?: string[];
  /** Origin allowlist; defaults to `https://simp.sontx.dev`. Only these origins get CORS headers. */
  allowedOrigins?: string[];
  /** Receives one structured entry per log event, including each request. */
  log?: (entry: Record<string, unknown>) => void;
}

/** A running simp node returned by {@link startSimpNode}. */
export interface SimpNode {
  /** Peer API base URL, such as `http://127.0.0.1:3393/simp`. */
  url: string;
  /** Underlying HTTP server. */
  server: Server;
  /** Peer service answering the API; usable directly as an in-process peer. */
  service: PeerService;
  /** Loaded KB status. */
  status: KBStatus;
  /** Declared peers skipped because they have no URL. */
  skipped: string[];
  /** Stops accepting connections, closes idle ones, and resolves once the server has closed. */
  close(): Promise<void>;
}

/**
 * Loads a KB, connects the peers its `simp.md` declares, and serves the simp
 * peer API over HTTP, as `simp-node serve` does.
 *
 * @example
 * ```ts
 * const node = await startSimpNode({ kb: "kb", port: 0 });
 * console.log(node.url);
 * await node.close();
 * ```
 */
export async function startSimpNode(
  opts: SimpNodeOptions = {},
): Promise<SimpNode> {
  const host = opts.host ?? "127.0.0.1",
    basePath = opts.basePath ?? "/simp",
    timeoutMs = opts.timeoutMs ?? 2000;
  if (!basePath.startsWith("/")) throw new Error("base-path must start with /");
  const root =
    typeof opts.kb === "object" ? undefined : path.resolve(opts.kb ?? "kb");
  const kb = typeof opts.kb === "object" ? opts.kb : await createKB(root!);
  const doc = simpDoc(kb.graph);
  if (!doc)
    throw new Error(
      `KB at ${root ?? kb.status.root} has no simp.md; a simp node needs a name`,
    );
  const config = loadPeerConfig(
    doc,
    {
      urls: opts.peerOverrides?.urls ?? {},
      tokens: opts.peerOverrides?.tokens ?? {},
    },
    { timeoutMs, kbRoot: root ?? kb.status.root },
  );
  const service = createPeerService({
    kb,
    peers: config.peers,
    modes: config.modes,
    maxHops: opts.maxHops ?? 2,
    timeoutMs,
    log: opts.log,
  });
  const server = createServer(
    createSimpNodeHandler({
      service,
      basePath,
      token: opts.token,
      allowedHosts: opts.allowedHosts,
      allowedOrigins: opts.allowedOrigins,
      onRequest: (entry) => opts.log?.({ msg: "request", ...entry }),
    }),
  );
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(opts.port ?? 3393, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return {
    url: `http://${host}:${(server.address() as { port: number }).port}${basePath}`,
    server,
    service,
    status: kb.status,
    skipped: config.skipped,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}

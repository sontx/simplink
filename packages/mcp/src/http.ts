import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { KBTools } from "@sontx/simplink-core";
import { createMcpServer } from "./server.js";

export interface McpHttpOptions {
  /** MCP endpoint path (default "/mcp"). */
  path?: string;
  /** Max JSON-RPC request body in bytes (default 1 MB). */
  maxBodyBytes?: number;
  /** Enables DNS-rebinding protection: only these Host header values are accepted. */
  allowedHosts?: string[];
  /** Enables DNS-rebinding protection: only these Origin header values are accepted. */
  allowedOrigins?: string[];
  /** Called once per request after the response finishes. */
  onRequest?: (entry: RequestLog) => void;
}

export interface RequestLog {
  method: string;
  path: string;
  status: number;
  ms: number;
  /** Forwarded by the gateway, if present. */
  requestId?: string;
}

const sendJson = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
  res.writeHead(status, { "content-type": "application/json", ...headers }).end(JSON.stringify(body));
};

/** JSON-RPC error envelope for transport-level failures (id unknown at this layer). */
const rpcError = (code: number, message: string) => ({ jsonrpc: "2.0", error: { code, message }, id: null });

/**
 * Stateless Streamable HTTP MCP endpoint as a plain Node request listener.
 * A fresh MCP server + transport is created per POST; the loaded KB tools are shared.
 * No auth: expected to run behind a gateway that authenticates requests.
 */
export function createMcpHttpHandler(tools: KBTools, opts: McpHttpOptions = {}): RequestListener {
  const mcpPath = opts.path ?? "/mcp";
  const protect = Boolean(opts.allowedHosts?.length || opts.allowedOrigins?.length);

  return async (req: IncomingMessage, res: ServerResponse) => {
    const started = performance.now();
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    res.on("finish", () =>
      opts.onRequest?.({
        method: req.method ?? "?",
        path,
        status: res.statusCode,
        ms: Math.round(performance.now() - started),
        requestId: (req.headers["x-request-id"] as string | undefined) ?? undefined,
      }),
    );

    if (path === "/healthz") {
      if (req.method !== "GET") return sendJson(res, 405, { error: "method not allowed" }, { allow: "GET" });
      return sendJson(res, 200, { ok: true, kb: { ...tools.status, root: undefined } });
    }
    if (path !== mcpPath) return sendJson(res, 404, { error: "not found" });
    // Stateless: no GET (server-initiated SSE stream) or DELETE (session end).
    if (req.method !== "POST") return sendJson(res, 405, rpcError(-32000, "Method not allowed."), { allow: "POST" });

    const server = createMcpServer(tools);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: opts.maxBodyBytes ?? 1_000_000,
      enableDnsRebindingProtection: protect,
      allowedHosts: opts.allowedHosts,
      allowedOrigins: opts.allowedOrigins,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      process.stderr.write(`[simp-mcp-http] ${(err as Error).stack ?? err}\n`);
      if (!res.headersSent) sendJson(res, 500, rpcError(-32603, "Internal server error"));
    }
  };
}

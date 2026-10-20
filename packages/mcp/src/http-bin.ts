#!/usr/bin/env node
import { createServer } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpHttpHandler } from "./http.js";

const env = process.env;
const { values } = (() => {
  try {
    return parseArgs({
      options: {
        kb: { type: "string", default: env.KB_DIR ?? "kb" },
        host: { type: "string", default: env.HOST ?? "127.0.0.1" },
        port: { type: "string", default: env.PORT ?? "3000" },
        path: { type: "string", default: env.MCP_PATH ?? "/mcp" },
        "max-body": {
          type: "string",
          default: env.MAX_BODY_BYTES ?? "1000000",
        },
        "allowed-host": {
          type: "string",
          multiple: true,
          default: env.ALLOWED_HOSTS?.split(",").filter(Boolean) ?? [],
        },
        "allowed-origin": {
          type: "string",
          multiple: true,
          default: env.ALLOWED_ORIGINS?.split(",").filter(Boolean) ?? [],
        },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    process.stderr.write(
      `${(error as Error).message}\nRun simp-mcp-http --help for usage.\n`,
    );
    process.exit(2);
  }
})();
if (values.help) {
  const usage = `Usage: simp-mcp-http [--kb dir] [--host h] [--port n] [--path p] [--max-body bytes] [--allowed-host h]... [--allowed-origin o]...

Serves the KB tools over stateless Streamable HTTP, plus GET /healthz.
  --kb              KB directory (default: $KB_DIR or kb)
  --host            listen address (default: $HOST or 127.0.0.1)
  --port            listen port (default: $PORT or 3000)
  --path            MCP endpoint path (default: $MCP_PATH or /mcp)
  --max-body        max request body in bytes (default: $MAX_BODY_BYTES or 1000000)
  --allowed-host    accepted Host header, repeatable (default: $ALLOWED_HOSTS, comma-separated)
  --allowed-origin  accepted Origin header, repeatable (default: $ALLOWED_ORIGINS, comma-separated)
No authentication: run behind a gateway that authenticates requests.
`;
  process.stdout.write(usage);
  process.exit(0);
}

const log = (entry: Record<string, unknown>) =>
  process.stdout.write(
    `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`,
  );

const root = path.resolve(values.kb!);
const tools = await createKBTools(root, { tenantContext: false });
log({ msg: "kb loaded", ...tools.status });
if (tools.status.errors)
  log({
    msg: "kb has lint errors; serving anyway",
    errors: tools.status.errors,
  });

const server = createServer(
  createMcpHttpHandler(tools, {
    path: values.path,
    maxBodyBytes: Number(values["max-body"]),
    allowedHosts: values["allowed-host"],
    allowedOrigins: values["allowed-origin"],
    onRequest: (e) => log({ msg: "request", ...e }),
  }),
);
// Keep idle connections open longer than typical load balancer idle timeouts (60s).
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(Number(values.port), values.host, () =>
  log({
    msg: "listening",
    url: `http://${values.host}:${values.port}${values.path}`,
  }),
);

const shutdown = (signal: string) => {
  log({ msg: "shutting down", signal });
  server.close(() => process.exit(0));
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

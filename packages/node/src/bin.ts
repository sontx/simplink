#!/usr/bin/env node
import { createServer } from "node:http";
import path from "node:path";
import { parseArgs } from "node:util";
import { createKB, createPeerService, simpDoc } from "@sontx/simplink-core";
import { createSimpNodeHandler } from "./http.js";
import { loadPeerConfig, parsePeerOverrides } from "./config.js";
import { lintPeers } from "./lint-peers.js";
const env = process.env;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      kb: { type: "string" },
      host: { type: "string", default: env.HOST ?? "127.0.0.1" },
      port: { type: "string", default: env.PORT ?? "3393" },
      "base-path": { type: "string", default: env.SIMP_BASE_PATH ?? "/simp" },
      token: { type: "string", default: env.SIMP_TOKEN },
      peer: { type: "string", multiple: true, default: [] },
      "peer-token": { type: "string", multiple: true, default: [] },
      "max-hops": { type: "string", default: "2" },
      "peer-timeout": { type: "string", default: "2000" },
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
      peers: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    process.stdout.write(
      "Usage: simp-node [serve] [--kb dir] [--host h] [--port n] [--base-path p] [--token t] [--peer name=url]... [--peer-token name=token]... [--max-hops n] [--peer-timeout ms] [--allowed-host h]... [--allowed-origin o]...\n       simp-node lint --peers [kb]\n",
    );
    process.exit(0);
  }
  const lint = positionals[0] === "lint";
  if (
    lint
      ? positionals.length > 2 || !values.peers
      : positionals.length > 1 ||
        (positionals.length === 1 && positionals[0] !== "serve")
  )
    throw new Error("invalid command; run simp-node --help");
  const integer = (
    value: string,
    key: string,
    min: number,
    max = Number.MAX_SAFE_INTEGER,
  ) => {
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw new Error(`invalid ${key}: ${value}`);
    return Number(value);
  };
  const port = integer(values.port!, "port", 0, 65535),
    maxHops = integer(values["max-hops"]!, "max-hops", 0),
    timeoutMs = integer(values["peer-timeout"]!, "peer-timeout", 1);
  if (!values["base-path"]!.startsWith("/"))
    throw new Error("base-path must start with /");
  const root = path.resolve(
      values.kb ?? (lint ? positionals[1] : undefined) ?? env.KB_DIR ?? "kb",
    ),
    kb = await createKB(root),
    doc = simpDoc(kb.graph);
  if (!doc)
    throw new Error(`KB at ${root} has no simp.md; a simp node needs a name`);
  const config = loadPeerConfig(
    doc,
    parsePeerOverrides(
      { peer: values.peer!, "peer-token": values["peer-token"]! },
      env,
    ),
    { timeoutMs, kbRoot: root },
  );
  if (lint) {
    const issues = [...kb.issues, ...(await lintPeers(kb, config.peers))];
    for (const i of issues)
      process.stdout.write(`${i.path}: ${i.code} ${i.message}\n`);
    process.exit(issues.some((i) => i.severity === "error") ? 1 : 0);
  }
  const log = (entry: Record<string, unknown>) =>
    process.stdout.write(
      `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`,
    );
  const service = createPeerService({
    kb,
    peers: config.peers,
    modes: config.modes,
    maxHops,
    timeoutMs,
    log,
  });
  const server = createServer(
    createSimpNodeHandler({
      service,
      basePath: values["base-path"],
      token: values.token,
      allowedHosts: values["allowed-host"],
      allowedOrigins: values["allowed-origin"],
      onRequest: (entry) => log({ msg: "request", ...entry }),
    }),
  );
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  server.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
  server.listen(port, values.host, () =>
    log({
      msg: "listening",
      url: `http://${values.host}:${(server.address() as { port: number }).port}${values["base-path"]}`,
      kb: kb.status,
      skipped: config.skipped,
    }),
  );
  const shutdown = (signal: string) => {
    log({ msg: "shutting down", signal });
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 2;
}

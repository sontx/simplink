#!/usr/bin/env node
import path from "node:path";
import { parseArgs } from "node:util";
import { createKB, simpDoc } from "@sontx/simplink-core";
import { startSimpNode } from "./server.js";
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
  const root = path.resolve(
      values.kb ?? (lint ? positionals[1] : undefined) ?? env.KB_DIR ?? "kb",
    ),
    kb = await createKB(root),
    doc = simpDoc(kb.graph);
  if (!doc)
    throw new Error(`KB at ${root} has no simp.md; a simp node needs a name`);
  const overrides = parsePeerOverrides(
    { peer: values.peer!, "peer-token": values["peer-token"]! },
    env,
  );
  if (lint) {
    const config = loadPeerConfig(doc, overrides, { timeoutMs, kbRoot: root });
    const issues = [...kb.issues, ...(await lintPeers(kb, config.peers))];
    for (const i of issues)
      process.stdout.write(`${i.path}: ${i.code} ${i.message}\n`);
    process.exit(issues.some((i) => i.severity === "error") ? 1 : 0);
  }
  const log = (entry: Record<string, unknown>) =>
    process.stdout.write(
      `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`,
    );
  const node = await startSimpNode({
    kb,
    host: values.host,
    port,
    basePath: values["base-path"],
    token: values.token,
    peerOverrides: overrides,
    maxHops,
    timeoutMs,
    allowedHosts: values["allowed-host"],
    allowedOrigins: values["allowed-origin"],
    log,
  });
  node.server.on("error", (error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  });
  log({
    msg: "listening",
    url: node.url,
    kb: node.status,
    skipped: node.skipped,
  });
  const shutdown = (signal: string) => {
    log({ msg: "shutting down", signal });
    void node.close().then(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exitCode = 2;
}

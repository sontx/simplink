#!/usr/bin/env node
import path from "node:path";
import { styleText } from "node:util";
import { Command, CommanderError, Option } from "commander";
import * as p from "@clack/prompts";
import { createKB, simpDoc } from "@sontx/simplink-core";
import { startSimpNode } from "./server.js";
import { loadPeerConfig, parsePeerOverrides } from "./config.js";
import { lintPeers } from "./lint-peers.js";
const env = process.env;
const tty = !!process.stdout.isTTY && !p.isCI();
const paint = (format: Parameters<typeof styleText>[0], text: string) =>
  tty ? styleText(format, text) : text;
/** One readable log line: `12:00:00  GET  200  /simp/search  3ms`. */
function prettyLine({ msg, ...rest }: Record<string, unknown>): string {
  const time = paint("gray", new Date().toLocaleTimeString("en-GB"));
  if (msg === "request") {
    const status = Number(rest.status);
    const color = status >= 500 ? "red" : status >= 400 ? "yellow" : "green";
    return `${time}  ${paint("bold", String(rest.method).padEnd(6))} ${paint(color, String(status))}  ${String(rest.path)}  ${paint("gray", `${String(rest.ms)}ms`)}`;
  }
  const fields = Object.entries(rest)
    .map(
      ([k, v]) =>
        `${paint("gray", `${k}=`)}${typeof v === "object" ? JSON.stringify(v) : String(v)}`,
    )
    .join(" ");
  return `${time}  ${paint("cyan", String(msg))} ${fields}`;
}
const collect = (value: string, previous: string[] = []) => [
  ...previous,
  value,
];
const integer =
  (key: string, min: number, max = Number.MAX_SAFE_INTEGER) =>
  (value: string) => {
    if (
      !/^\d+$/.test(value) ||
      !Number.isSafeInteger(Number(value)) ||
      Number(value) < min ||
      Number(value) > max
    )
      throw new Error(`invalid ${key}: ${value}`);
    return Number(value);
  };
interface PeerOptions {
  kb?: string;
  peer: string[];
  peerToken: string[];
  peerTimeout: number;
}
/** Peer flags shared by `serve` and `lint`. */
const peerOptions = (command: Command) =>
  command
    .option("--kb <dir>", "KB directory (env KB_DIR)")
    .option("--peer <name=url>", "peer URL override, repeatable", collect, [])
    .option(
      "--peer-token <name=token>",
      "peer bearer token, repeatable",
      collect,
      [],
    )
    .option(
      "--peer-timeout <ms>",
      "peer request timeout",
      integer("peer-timeout", 1),
      2000,
    );
async function loadKB(root: string, ui = tty) {
  const spin = ui ? p.spinner() : undefined;
  spin?.start(`Loading ${root}`);
  try {
    const kb = await createKB(root),
      doc = simpDoc(kb.graph);
    if (!doc)
      throw new Error(`KB at ${root} has no simp.md; a simp node needs a name`);
    spin?.stop(
      `Loaded ${doc.name}: ${kb.status.nodes} nodes, ${kb.status.errors} error(s), ${kb.status.warnings} warning(s)`,
    );
    return { kb, doc };
  } catch (error) {
    spin?.error(`Loading ${root}`);
    throw error;
  } finally {
    // ponytail: @clack/core leaves stdin raw on Windows, which turns Ctrl+C into a swallowed keypress instead of SIGINT.
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  }
}
const program = new Command("simp-node")
  .description("Serve a Simplink KB to peers and check federated references.")
  .exitOverride()
  .showSuggestionAfterError();
peerOptions(
  program
    .command("serve", { isDefault: true })
    .description("Start the HTTP simp node (default)"),
)
  .addOption(
    new Option("--host <host>", "listen host").env("HOST").default("127.0.0.1"),
  )
  .addOption(
    new Option("--port <n>", "listen port")
      .env("PORT")
      .argParser(integer("port", 0, 65535))
      .default(3393),
  )
  .addOption(
    new Option("--base-path <path>", "route prefix")
      .env("SIMP_BASE_PATH")
      .default("/simp"),
  )
  .addOption(
    new Option("--token <token>", "bearer token required from callers").env(
      "SIMP_TOKEN",
    ),
  )
  .addOption(
    new Option("--log-format <format>", "log output")
      .choices(["pretty", "json"])
      .env("SIMP_LOG_FORMAT")
      .default("pretty"),
  )
  .option("--max-hops <n>", "federation hop limit", integer("max-hops", 0), 2)
  .option(
    "--allowed-host <host>",
    "allowed Host header, repeatable (env ALLOWED_HOSTS)",
    collect,
    env.ALLOWED_HOSTS?.split(",").filter(Boolean) ?? [],
  )
  .option(
    "--allowed-origin <origin>",
    "allowed CORS origin, repeatable; defaults to https://simp.sontx.dev; * allows any (env ALLOWED_ORIGINS)",
    collect,
    env.ALLOWED_ORIGINS?.split(",").filter(Boolean),
  )
  .action(
    async (
      opts: PeerOptions & {
        host: string;
        port: number;
        basePath: string;
        token?: string;
        maxHops: number;
        allowedHost: string[];
        allowedOrigin?: string[];
        logFormat: "pretty" | "json";
      },
    ) => {
      // ponytail: clack frames only for a human at a terminal; --log-format json stays machine-clean.
      const json = opts.logFormat === "json",
        ui = tty && !json;
      if (ui) p.intro("simp-node");
      const root = path.resolve(opts.kb ?? env.KB_DIR ?? "kb");
      const { kb } = await loadKB(root, ui);
      const log = (entry: Record<string, unknown>) =>
        process.stdout.write(
          `${json ? JSON.stringify({ t: new Date().toISOString(), ...entry }) : prettyLine(entry)}
`,
        );
      const node = await startSimpNode({
        kb,
        assetRoot: root,
        host: opts.host,
        port: opts.port,
        basePath: opts.basePath,
        token: opts.token,
        peerOverrides: parsePeerOverrides(
          { peer: opts.peer, "peer-token": opts.peerToken },
          env,
        ),
        maxHops: opts.maxHops,
        timeoutMs: opts.peerTimeout,
        allowedHosts: opts.allowedHost,
        allowedOrigins: opts.allowedOrigin,
        log,
      });
      node.server.on("error", (error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 2;
      });
      if (ui)
        p.note(
          [
            `URL      ${node.url}`,
            `Auth     ${opts.token ? "bearer token" : "none"}`,
            `Skipped  ${node.skipped.join(", ") || "none"}`,
          ].join("\n"),
          "Listening — Ctrl+C to stop",
        );
      else
        log(
          json
            ? {
                msg: "listening",
                url: node.url,
                kb: node.status,
                skipped: node.skipped,
              }
            : {
                msg: "listening",
                url: node.url,
                nodes: node.status.nodes,
                errors: node.status.errors,
                warnings: node.status.warnings,
                skipped: node.skipped.join(",") || "none",
              },
        );
      const shutdown = (signal: string) => {
        if (ui) p.outro(`Shutting down (${signal})`);
        else log({ msg: "shutting down", signal });
        void node.close().then(() => process.exit(0));
        setTimeout(() => process.exit(1), 10000).unref();
      };
      process.on("SIGTERM", () => shutdown("SIGTERM"));
      process.on("SIGINT", () => shutdown("SIGINT"));
    },
  );
peerOptions(
  program
    .command("lint")
    .description("Check remote references against live peers")
    .argument("[kb]", "KB directory"),
)
  .requiredOption("--peers", "look up references on peers")
  .action(async (dir: string | undefined, opts: PeerOptions) => {
    if (tty) p.intro("simp-node lint");
    const root = path.resolve(opts.kb ?? dir ?? env.KB_DIR ?? "kb");
    const { kb, doc } = await loadKB(root);
    const overrides = parsePeerOverrides(
      { peer: opts.peer, "peer-token": opts.peerToken },
      env,
    );
    const config = loadPeerConfig(doc, overrides, {
      timeoutMs: opts.peerTimeout,
      kbRoot: root,
    });
    const issues = [...kb.issues, ...(await lintPeers(kb, config.peers))];
    const errors = issues.filter((i) => i.severity === "error").length;
    if (tty) {
      for (const i of issues)
        (i.severity === "error" ? p.log.error : p.log.warn)(
          `${i.path}: ${i.code} ${i.message}`,
        );
      p.outro(`${errors} error(s), ${issues.length - errors} warning(s)`);
    } else
      for (const i of issues)
        process.stdout.write(`${i.path}: ${i.code} ${i.message}\n`);
    process.exitCode = errors ? 1 : 0;
  });
try {
  await program.parseAsync();
} catch (error) {
  if (error instanceof CommanderError) process.exitCode = error.exitCode && 2;
  else {
    if (tty) p.cancel((error as Error).message);
    else process.stderr.write(`${(error as Error).message}\n`);
    process.exitCode = 2;
  }
}

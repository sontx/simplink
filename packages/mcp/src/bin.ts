#!/usr/bin/env node
import { parseArgs } from "node:util";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createKBTools } from "@sontx/simplink-core";
import { openFederatedKB } from "./kb-source.js";
import { createMcpServer } from "./server.js";

// stdout carries the MCP protocol: log to stderr only.
const log = (msg: string) => process.stderr.write(`[simp-mcp] ${msg}\n`);

const { values } = (() => {
  try {
    return parseArgs({
      options: {
        kb: { type: "string" },
        simp: { type: "string" },
        "simp-token": { type: "string" },
        "no-peers": { type: "boolean", default: false },
        peer: { type: "string", multiple: true, default: [] },
        "peer-token": { type: "string", multiple: true, default: [] },
        "peer-timeout": { type: "string", default: "2000" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    log(`${(error as Error).message}\nRun simp-mcp --help for usage.`);
    process.exit(2);
  }
})();
if (values.help) {
  process.stdout.write(`Usage: simp-mcp [--kb dir]

Serves the KB tools over MCP stdio.
  --simp URL  Connect to a simp node, static KB, or folder (exclusive with --kb)
  --simp-token TOKEN  Bearer token for --simp
  --no-peers  Disable declared peers in standalone mode
  --peer name=URL  Override a peer URL (repeatable)
  --peer-token name=TOKEN  Override a peer token (repeatable)
  --peer-timeout MS  Peer timeout (default: 2000)
  --kb  KB directory (default: $KB_DIR or kb)
`);
  process.exit(0);
}
const kb = await (async () => {
  try {
    return await openFederatedKB(
      {
        kb: values.kb,
        simp: values.simp,
        simpToken: values["simp-token"],
        noPeers: values["no-peers"],
        peer: values.peer,
        peerToken: values["peer-token"],
        peerTimeout: Number(values["peer-timeout"]),
      },
      process.env,
    );
  } catch (error) {
    process.stderr.write(
      `${(error as Error).message}\nRun simp-mcp --help for usage.\n`,
    );
    process.exit(2);
  }
})();

const tools = await createKBTools(kb);
const s = tools.status;
log(
  `loaded ${kb.status.root}: ${s.nodes} nodes, ${s.edges} edges, ${s.errors} error(s), ${s.warnings} warning(s)`,
);
if (s.errors)
  log("KB has lint errors; run simp-lint for details. Serving anyway.");

await createMcpServer(tools).connect(new StdioServerTransport());
log("ready on stdio");

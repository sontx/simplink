#!/usr/bin/env node
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import { createUiHandler } from "./server.js";

try {
  const args = process.argv.slice(2);
  if (args[0] === "--") args.shift();
  const { values } = parseArgs({
    args,
    options: {
      kb: { type: "string", default: "kb" },
      host: { type: "string", default: "127.0.0.1" },
      port: { type: "string", default: "4321" },
    },
  });
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Port must be an integer between 0 and 65535");
  const server = createServer(createUiHandler(values.kb));
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, values.host, () => {
    const address = server.address();
    console.log(
      `Simplink UI: http://${values.host}:${typeof address === "object" && address ? address.port : port}`,
    );
  });
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}

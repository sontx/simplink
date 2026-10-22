# @sontx/simplink-mcp

Expose Simplink KB tools over MCP using stdio or stateless Streamable HTTP.
ESM for Node.js 22+, with TypeScript declarations. Depends on
`@sontx/simplink-core` and the MCP SDK.

```ts
import { createServer } from "node:http";
import { createKBTools } from "@sontx/simplink-core";
import { createMcpHttpHandler } from "@sontx/simplink-mcp";

const tools = await createKBTools("/path/to/kb");
createServer(createMcpHttpHandler(tools)).listen(3000, "127.0.0.1");
```

`createMcpServer(tools)` creates a server that can connect to any MCP transport.
`SERVER_INSTRUCTIONS`, `McpHttpOptions`, and `RequestLog` are also exported.

```sh
simp-mcp --kb /path/to/kb
simp-mcp-http --kb /path/to/kb --port 3000
```

The HTTP CLI exposes `/mcp` and `/healthz`, and disables tenant context arguments.
Authentication is expected to be handled by a gateway.

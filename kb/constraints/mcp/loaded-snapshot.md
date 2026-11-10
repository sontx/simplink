---
type: constraint
title: Check KB health even when the server starts
summary: MCP servers start and serve even when the KB has lint errors, and they keep the snapshot loaded at startup until restarted.
severity: warning
aliases:
  - MCP không nạp lại KB
  - restart MCP server to reload
  - MCP serving anyway
---

- Both servers load the KB once at startup. With lint errors they log `Serving anyway.` (stdio, on stderr) or `kb has lint errors; serving anyway` (HTTP, as a JSON line on stdout) and keep running.
- While the KB has errors, each successful tool result starts with `[KB has N lint error(s); results may be incomplete]`.
- `/healthz` returns `ok: true` whenever the server is running. Read its `kb.errors` count to see whether the KB is healthy.
- Edits to the KB files are not picked up until the server restarts. For Docker, mount the replacement KB at `/app/kb` and restart the container.
- The `--kb` value is a local directory, defaulting to `KB_DIR` and then `kb`. The server commands do not clone Git URLs.
- `--simp` replaces `--kb` with a running simp, static KB URL, or folder as the home product; the two flags cannot be combined. The home source must answer its manifest request at startup, or the server exits with code 2. Declared peers are not contacted at startup, so an unreachable peer does not stop the server.

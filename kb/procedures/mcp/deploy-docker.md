---
type: procedure
title: Build and run the MCP HTTP server image
summary: Build the repository's Docker image with a KB, run it on port 3000, check its health, and mount a replacement KB when needed.
aliases:
  - chạy container MCP
  - run the MCP container
preconditions:
  - state.authoring.documents-exist
optional_preconditions:
  - state.authoring.no-lint-errors
produces:
  - state.mcp.tools-connected
uses:
  - capability.mcp.tool-transports
constrained_by:
  - constraint.mcp.http-boundary
  - constraint.mcp.loaded-snapshot
---

## Steps

1. Put the KB to serve in the repository's root `kb/` folder; by default it holds the Simplink KB. Run `simp-lint kb` to confirm that it has no errors.
2. Build the image from the repository root with `docker build -t simplink .`.
3. Start a container with `docker run -d --name simplink -p 3000:3000 simplink`. Pass settings with `-e`, for example `-e ALLOWED_HOSTS=kb.example.com -e ALLOWED_ORIGINS=https://app.example.com`.
4. Check `docker ps` until the container is `healthy`, or request `GET http://localhost:3000/healthz` and check `ok` and `kb.errors`.
5. Put the container behind a gateway that authenticates requests, and point MCP clients at `http://<host>:3000/mcp`.
6. To serve another KB without rebuilding, start the container with `-v /path/to/kb:/app/kb:ro`, and restart it after each KB change.

## Failure handling

- The image runs `simp-mcp-http` with `HOST=0.0.0.0`, `PORT=3000`, and `KB_DIR=/app/kb`; without `ALLOWED_HOSTS` or `ALLOWED_ORIGINS`, it checks no `Host` or `Origin` header.
- Read `docker logs simplink` for the `kb loaded` line and for `kb has lint errors; serving anyway`.
- The build context excludes `node_modules`, `dist`, `test`, and `.git`, so a KB stored in a folder named `test` is not copied into the image.

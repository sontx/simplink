---
type: procedure
title: Start simp-ui against the selected knowledge base
summary: Run simp-ui with a local KB folder or a Git URL, then open the printed loopback URL in a browser.
aliases:
  - chạy simp-ui
  - run simp-ui
produces:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
constrained_by:
  - constraint.ui.local-write-boundary
  - constraint.ui.git-clone-lifecycle
sources:
  - packages/ui/src/bin.ts
  - packages/ui/src/server.ts
  - package.json
  - README.md
---

## Steps

1. Install `@sontx/simplink-ui`, or run `pnpm build` in this repository so that the UI bundle exists.
2. Run `simp-ui --kb <path-or-git-url>`; from the repository, run `pnpm ui --kb <path-or-git-url>`. `--kb` defaults to `kb`, `--host` to `127.0.0.1`, and `--port` to `4321`.
3. For a Git URL, note the `Git KB clone: <path>` line; that clone is where your edits are saved.
4. Open the printed `Simplink UI: http://...` address in a browser on the same machine.
5. Check the error and warning counts in the header before you start editing.

## Failure handling

- `Unable to load workspace` with **Try again**: the KB folder or clone could not be loaded. Check the path, the Git URL, and the credentials, then restart `simp-ui`.
- `Port must be an integer between 0 and 65535`: pass a valid `--port`.
- For development, `pnpm dev:ui --kb <path>` runs the API on port 4321 and Vite on port 5173.

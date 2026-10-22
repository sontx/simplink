---
type: procedure
title: Connect the browser workspace to a simp node
summary: Allow the UI's origin on a running simp node, then connect from the open screen to browse that product's KB read-only.
aliases:
  - kết nối giao diện tới nút simp
  - browse a remote simp node
  - open a simp node in the UI
produces:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
  - capability.federation.peer-api
sources:
  - packages/ui/src/workspace/context.tsx
  - packages/ui/src/workspace/store.ts
  - packages/node/src/http.ts
---

## Steps

1. Start the simp node with the UI's origin allowed, for example `simp-node --allowed-origin http://localhost:5173` or `ALLOWED_ORIGINS=http://localhost:5173`. Use the exact origin shown in the browser address bar, or `*` to allow any origin; with `*`, protect the node with `--token`.
2. Open the UI. Under **Or connect to a simp node**, enter the node URL, such as `http://localhost:3393`. A bare origin uses the `/simp` base path; include the path when the node uses a custom base.
3. Enter the node's bearer token when it has one, then select **Connect**. The UI remembers the URL but not the token.
4. Browse Graph, Nodes, Issues, Docs, and Playground. The workspace is read-only: editing controls are hidden and the files are rebuilt from the node's nodes, so formatting and comments can differ from the source files.

## Failure handling

- A network or CORS error means the node does not list the UI's origin in its allowed origins.
- `unauthorized` means the token is missing or wrong.
- Use **Reload** to fetch the node's current KB again.

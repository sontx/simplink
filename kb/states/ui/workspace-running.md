---
type: state
title: The selected KB is open in the local UI
summary: simp-ui is running against the intended KB, and its page loads in a browser on the same machine.
check: "Open the URL printed as `Simplink UI: http://...` (default `http://127.0.0.1:4321`) and confirm that the sidebar shows **LOCAL KB** with the expected node count and no `Unable to load workspace` message."
satisfied_by:
  - procedure.ui.launch-workspace
sources:
  - packages/ui/src/bin.ts
  - packages/ui/src/server.ts
  - packages/ui/web/src/routes/__root.tsx
---

For a Git URL, the server log also shows `Git KB clone: <path>`, the folder that the UI edits.

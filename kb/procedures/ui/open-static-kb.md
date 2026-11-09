---
type: procedure
title: Open a static KB URL in the browser workspace
summary: Open a KB published as static files by URL, read-only, using the optional Cloudflare Worker proxy for hosts without CORS headers.
aliases:
  - mở KB tĩnh bằng URL
  - open a published KB in the UI
  - kb-proxy CORS proxy
requires:
  - procedure.federation.publish-static-simp
produces:
  - state.ui.workspace-running
uses:
  - capability.ui.local-manager
sources:
  - packages/ui/src/workspace/static-kb.ts
  - packages/ui/src/workspace/store.ts
  - packages/ui/src/workspace/context.tsx
  - packages/kb-proxy/src/index.ts
  - packages/kb-proxy/wrangler.jsonc
---

## Steps

1. Publish the KB with `simp.md` and `simp-index.yaml` at its base URL. The UI lists files from the index, so a static KB without it cannot be opened.
2. If the host does not send CORS headers, deploy the proxy: run `pnpm --filter @sontx/simplink-kb-proxy run deploy`, set `ALLOWED_ORIGINS` to the UI origins, then build the UI with `VITE_SIMPLINK_KB_PROXY=<worker URL> pnpm build`.
3. Under **Or connect to a simp node or static KB**, enter the KB base URL, leave **Token (optional)** empty, and select **Connect**. The UI tries a simp node first, then the static KB; files the browser cannot fetch directly are retried through the proxy.
4. Browse the workspace read-only. Node files are cached in the browser and reused until `simp.md` or `simp-index.yaml` changes, for at most a day. Select **Reload** to fetch every file again.

## Failure handling

- `has simp.md but no simp-index.yaml` means the index was not published; run `simp-index <kb>` and republish.
- A **Cannot reach** error means neither a simp node nor a static KB answered: check the URL, or configure the proxy for a host without CORS headers.
- The proxy only serves `GET` requests for `*.md` and `simp-index.yaml` files, rejects HTML fallbacks as missing, and refuses origins not in `ALLOWED_ORIGINS` when it is set.

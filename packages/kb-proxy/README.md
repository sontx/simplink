# @sontx/simplink-kb-proxy

A Cloudflare Worker that works on the free plan. It lets the Simplink UI read static KBs from hosts that send no CORS headers. It is not published to npm.

The UI first fetches a static KB file directly. When the browser blocks that request, which happens on hosts without CORS headers, the UI fetches the file again as `GET <worker>/?url=<file URL>`. After one blocked request, the UI sends the rest of that host's files straight to the proxy. Node files are cached in the browser's Cache Storage and reused until `simp.md` or `simp-index.yaml` changes, for at most a day. **Reload** in the UI fetches every file again.

The Worker only proxies `GET`/`HEAD` requests for `http(s)` URLs ending in `.md` or `simp-index.yaml`. It returns them as `text/plain` and caps each file at 5 MB. It reports HTML responses, such as SPA fallbacks, as `404`, and it also returns `404` when a redirect ends somewhere other than a KB file. Cloudflare's edge caches each file for `CACHE_SECONDS`.

## Deploy

```sh
pnpm exec wrangler login
pnpm --filter @sontx/simplink-kb-proxy run deploy
```

In `wrangler.jsonc` (or as dashboard variables), set:

- `ALLOWED_ORIGINS`: a comma-separated list of the UI origins, such as `https://simplink.example.com,http://localhost:5173`. When it is empty, any origin can use the proxy, so set it for a public deployment.
- `CACHE_SECONDS`: how long the edge and browsers cache a file. The default is `300`.

Then build the UI with the Worker URL:

```sh
VITE_SIMPLINK_KB_PROXY=https://simplink-kb-proxy.<account>.workers.dev pnpm build
```

`packages/ui/.env.production` sets the default, `https://simp-cors.sontx.dev`. A variable set in the shell overrides it, and setting it empty turns the proxy off.

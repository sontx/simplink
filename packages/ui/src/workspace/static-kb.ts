import { parseDoc, parseSimpIndex } from "@sontx/simplink-core/browser";
import type { KBStore } from "./store.js";

/** The URL has no static KB: no `simp.md`, or one that is not a simp manifest. */
export class NotStaticKBError extends Error {}

/** The subset of the Cache Storage API the store uses, so tests can pass a fake. */
export interface FileCache {
  match(url: string): Promise<Response | undefined>;
  put(url: string, response: Response): Promise<void>;
  delete(url: string): Promise<boolean>;
  keys(): Promise<readonly { url: string }[]>;
}

export interface StaticStoreOptions {
  /**
   * CORS proxy base URL, such as a deployed `workers/kb-proxy`. A file that
   * the browser cannot fetch directly is retried as `<proxy>?url=<file URL>`.
   */
  proxy?: string;
  fetch?: typeof fetch;
  /** Node file cache; defaults to the browser's Cache Storage when available. `null` disables it. */
  cache?: FileCache | null;
  now?: () => number;
  timeoutMs?: number;
}

const CACHE_NAME = "simplink-kb-files";
const MAX_AGE = 24 * 60 * 60 * 1000;
const MAX_BYTES = 20000000;

// Origins that already failed a direct fetch, so later files go straight to the proxy.
const proxiedOrigins = new Set<string>();

async function browserCache(): Promise<FileCache | null> {
  try {
    return (await globalThis.caches?.open(CACHE_NAME)) ?? null;
  } catch {
    // Cache Storage needs a secure context and may be blocked; loading still works without it.
    return null;
  }
}

// FNV-1a: a cheap fingerprint of simp.md and the index; any republish that changes either drops cached files.
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Read-only KB published as static files (`simp.md`, `simp-index.yaml`, and
 * the node Markdown files). Files the browser cannot read directly, usually
 * because the host sends no CORS headers, are fetched through `opts.proxy`.
 * Node files are cached until `simp.md` or the index changes, for at most a
 * day; reloading the workspace fetches everything again.
 */
export async function staticStore(
  url: string,
  opts: StaticStoreOptions = {},
): Promise<KBStore> {
  const base = new URL(`${url.trim().replace(/\/+$/, "")}/`);
  const doFetch = opts.fetch ?? fetch;
  const now = opts.now ?? Date.now;
  const proxy = opts.proxy?.trim();
  const cache = opts.cache === undefined ? await browserCache() : opts.cache;

  const request = (href: string, fresh: boolean) =>
    doFetch(href, {
      ...(fresh ? { cache: "no-cache" as const } : {}),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30000),
    });
  const viaProxy = (target: URL, fresh: boolean) =>
    request(`${proxy}?url=${encodeURIComponent(target.href)}`, fresh);

  // Direct first; a CORS refusal retries through the proxy, which then serves the rest of that host.
  const fetchFile = async (path: string, fresh: boolean): Promise<Response> => {
    const target = new URL(path, base);
    if (!target.href.startsWith(base.href)) throw new Error("path outside KB");
    if (proxy && proxiedOrigins.has(target.origin))
      return viaProxy(target, fresh);
    try {
      return await request(target.href, fresh);
    } catch (error) {
      // Browsers report CORS refusals as a bare TypeError.
      if (!proxy || !(error instanceof TypeError)) throw error;
      const response = await viaProxy(target, fresh);
      proxiedOrigins.add(target.origin);
      return response;
    }
  };

  const budget = { bytes: 0 };
  const get = async (
    path: string,
    fresh: boolean,
  ): Promise<string | undefined> => {
    const response = await fetchFile(path, fresh);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
    const text = await response.text();
    budget.bytes += text.length;
    if (budget.bytes > MAX_BYTES) throw new Error("static KB is too large");
    return text;
  };

  const readManifest = async () => {
    let text: string | undefined;
    try {
      text = await get("simp.md", true);
    } catch (error) {
      if (error instanceof TypeError) throw new NotStaticKBError(base.href);
      throw error;
    }
    const parsed = text === undefined ? undefined : parseDoc("simp.md", text);
    if (
      !parsed ||
      parsed.parseError ||
      parsed.data.type !== "simp" ||
      typeof parsed.data.name !== "string"
    )
      throw new NotStaticKBError(base.href);
    return { text: text!, data: parsed.data };
  };

  // Reads a node file from the cache when it belongs to this publish and is under a day old.
  const cachedFile = async (href: string, version: string) => {
    if (!cache) return undefined;
    try {
      const hit = await cache.match(href);
      if (
        hit &&
        hit.headers.get("x-simplink-version") === version &&
        now() - Number(hit.headers.get("x-simplink-cached-at")) < MAX_AGE
      )
        return await hit.text();
    } catch {
      /* A broken cache entry is fetched again. */
    }
    return undefined;
  };

  const storeFile = async (href: string, version: string, text: string) => {
    try {
      await cache?.put(
        href,
        new Response(text, {
          headers: {
            "content-type": "text/markdown; charset=utf-8",
            "x-simplink-version": version,
            "x-simplink-cached-at": String(now()),
          },
        }),
      );
    } catch {
      /* Caching is optional; quota or private mode may refuse it. */
    }
  };

  let manifest: Awaited<ReturnType<typeof readManifest>> | undefined =
    await readManifest();
  const name =
    typeof manifest.data.title === "string" && manifest.data.title
      ? manifest.data.title
      : (manifest.data.name as string);
  const files: Record<string, string> = {};
  const readOnly = () => {
    throw new Error("Remote KBs are read-only");
  };
  let listed = false;

  return {
    name,
    kind: "remote",
    readOnly: true,
    async list() {
      // The first list reuses the manifest read on open; a reload reads everything again.
      const fresh = listed;
      listed = true;
      budget.bytes = 0;
      const simp = manifest ?? (await readManifest());
      manifest = undefined;
      const indexText = await get("simp-index.yaml", true);
      if (indexText === undefined)
        throw new Error(
          `${base.href} has simp.md but no simp-index.yaml. Run simp-index on the KB and publish the index with it.`,
        );
      const index = parseSimpIndex(indexText);
      if (index.name !== simp.data.name)
        throw new Error("simp-index.yaml names a different simp than simp.md");
      const version = fingerprint(`${simp.text}\0${indexText}`);
      for (const key of Object.keys(files)) delete files[key];
      files["simp.md"] = simp.text;
      const paths = index.files.filter((path) => path !== "simp.md");
      // Bounded concurrency keeps a large KB from opening hundreds of requests at once.
      for (let start = 0; start < paths.length; start += 20)
        await Promise.all(
          paths.slice(start, start + 20).map(async (path) => {
            const href = new URL(path, base).href;
            let text = fresh ? undefined : await cachedFile(href, version);
            if (text === undefined) {
              text = await get(path, fresh);
              if (text === undefined) return;
              await storeFile(href, version, text);
            }
            files[path] = text;
          }),
        );
      // Drop cached files this KB no longer publishes.
      if (cache)
        try {
          const keep = new Set(paths.map((path) => new URL(path, base).href));
          for (const key of await cache.keys())
            if (key.url.startsWith(base.href) && !keep.has(key.url))
              await cache.delete(key.url);
        } catch {
          /* Stale entries expire by version or age anyway. */
        }
      return Object.entries(files).map(([relPath, content]) => ({
        relPath,
        content,
      }));
    },
    async read(relPath) {
      if (!Object.hasOwn(files, relPath)) throw new Error("File not found");
      return files[relPath];
    },
    // The index lists Markdown only, so assetPaths stays unknown; an <img> needs no CORS, so the plain URL is enough.
    async asset(relPath) {
      const target = new URL(relPath, base);
      if (!target.href.startsWith(base.href))
        throw new Error("path outside KB");
      return target.href;
    },
    // Bytes are needed only for a download; reading them needs CORS, so a blocked host goes through the proxy.
    async assetBlob(relPath) {
      const response = await fetchFile(relPath, false);
      if (!response.ok)
        throw new Error(`HTTP ${response.status} for ${relPath}`);
      return response.blob();
    },
    write: readOnly,
    remove: readOnly,
  };
}

/**
 * Cloudflare Worker that lets the Simplink UI read static KBs hosted without
 * CORS headers. It only proxies GET requests for KB files (`*.md` and
 * `simp-index.yaml`) over HTTP(S), so it cannot be used as a general proxy.
 *
 *   GET https://<worker>/?url=https://example.com/kb/simp.md
 */
export interface Env {
  /**
   * Comma-separated origins allowed to use the proxy, such as
   * `https://simplink.example.com,http://localhost:5173`. Empty allows any origin.
   */
  ALLOWED_ORIGINS?: string;
  /** Seconds Cloudflare's edge and browsers may cache a file. Defaults to 300. */
  CACHE_SECONDS?: string;
}

const MAX_BYTES = 5_000_000;
const MAX_IMAGE_BYTES = 10_000_000;
const KB_TEXT = /(?:^|\/)(?:simp-index\.yaml|[^/]+\.md)$/i;
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
};
const imageType = (pathname: string) =>
  IMAGE_TYPES[/\.([a-z0-9]+)$/i.exec(pathname)?.[1].toLowerCase() ?? ""];
const isKBFile = (pathname: string) =>
  KB_TEXT.test(pathname) || !!imageType(pathname);

function corsHeaders(origin: string | null, env: Env): Headers | undefined {
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const headers = new Headers({ vary: "Origin" });
  if (!allowed.length) headers.set("access-control-allow-origin", "*");
  else if (origin && allowed.includes(origin))
    headers.set("access-control-allow-origin", origin);
  else return undefined;
  return headers;
}

function reply(status: number, message: string, headers = new Headers()) {
  headers.set("content-type", "text/plain; charset=utf-8");
  return new Response(message, { status, headers });
}

// Reads at most MAX_BYTES so a huge upstream file cannot exhaust the Worker's memory.
async function readLimited(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > MAX_BYTES) {
    await response.body?.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

// Passes chunks through as they arrive, so an image never sits whole in the Worker's memory; past `max` the stream errors and the upstream is cancelled.
function limitStream(
  body: ReadableStream<Uint8Array>,
  max: number,
): ReadableStream<Uint8Array> {
  let size = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > max) controller.error(new Error("image too large"));
        else controller.enqueue(chunk);
      },
    }),
  );
}

/** Handles one proxy request; `upstream` replaces `fetch` in tests. */
export async function handle(
  request: Request,
  env: Env,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const cors = corsHeaders(request.headers.get("origin"), env);
  if (!cors) return reply(403, "origin not allowed");
  if (request.method === "OPTIONS") {
    cors.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
    cors.set("access-control-max-age", "86400");
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method !== "GET" && request.method !== "HEAD")
    return reply(405, "method not allowed", cors);

  let target: URL;
  try {
    target = new URL(new URL(request.url).searchParams.get("url") ?? "");
  } catch {
    return reply(400, "pass the KB file as ?url=<http(s) URL>", cors);
  }
  if (
    !/^https?:$/.test(target.protocol) ||
    target.username ||
    target.password ||
    !isKBFile(target.pathname)
  )
    return reply(
      400,
      "only http(s) .md, simp-index.yaml and image files",
      cors,
    );
  const image = imageType(target.pathname);

  const cacheSeconds = Number(env.CACHE_SECONDS ?? 300) || 0;
  let response: Response;
  try {
    response = await upstream(target.href, {
      headers: {
        accept: image ?? "text/markdown, text/yaml, text/plain, */*",
      },
      redirect: "follow",
      // Cloudflare caches the file at the edge, so repeated loads skip the origin.
      cf: { cacheTtl: cacheSeconds, cacheEverything: true },
    } as RequestInit);
  } catch {
    return reply(502, "upstream unreachable", cors);
  }
  // A redirect must still land on a file of the same kind.
  const landed = response.url ? new URL(response.url).pathname : undefined;
  if (
    landed !== undefined &&
    (image ? imageType(landed) !== image : !KB_TEXT.test(landed))
  ) {
    await response.body?.cancel();
    return reply(404, "not a KB file", cors);
  }
  // SPA hosts answer missing files with their HTML shell; report those as missing.
  if (
    response.ok &&
    /text\/html/i.test(response.headers.get("content-type") ?? "")
  ) {
    await response.body?.cancel();
    return reply(404, "not a KB file", cors);
  }
  if (!response.ok) {
    await response.body?.cancel();
    return reply(response.status, `upstream HTTP ${response.status}`, cors);
  }
  cors.set("x-content-type-options", "nosniff");
  // Only successful replies are cacheable, so a 413 is never served from cache after upstream is fixed.
  const cacheable = `public, max-age=${cacheSeconds}`;
  if (image) {
    if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      return reply(413, "image too large", cors);
    }
    cors.set("cache-control", cacheable);
    // The type comes from the extension, never upstream; opened directly, an SVG runs nothing on this origin.
    cors.set("content-type", image);
    cors.set("content-security-policy", "default-src 'none'; sandbox");
    // No content-length: upstream's may describe an encoded body, not the decoded stream.
    if (request.method === "HEAD" || !response.body) {
      await response.body?.cancel();
      return new Response(null, { status: 200, headers: cors });
    }
    return new Response(limitStream(response.body, MAX_IMAGE_BYTES), {
      status: 200,
      headers: cors,
    });
  }
  const body = await readLimited(response);
  if (!body) return reply(413, "KB file too large", cors);
  cors.set("cache-control", cacheable);
  // Served as plain text, so proxied content can never run as a page on this origin.
  cors.set("content-type", "text/plain; charset=utf-8");
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: cors,
  });
}

export default {
  fetch: (request: Request, env: Env) => handle(request, env),
};

import {
  createKB,
  createPeerService,
  memorySource,
  parseDoc,
  parseRef,
  idToPath,
  parseSimpIndex,
  type Peer,
  type SimpManifest,
} from "@sontx/simplink-core";
import type { HttpPeerOptions } from "./http-peer.js";
export function staticPeer(baseUrl: string, opts: HttpPeerOptions = {}): Peer {
  const base = new URL(`${baseUrl.replace(/\/$/, "")}/`);
  let name = opts.name ?? "",
    expires = 0,
    manifestValue: SimpManifest | undefined,
    simpText = "",
    previousIndex: string | undefined,
    loaded: Peer | undefined;
  const get = async (
    path: string,
    budget: { bytes: number },
  ): Promise<string | undefined> => {
    let url = new URL(path, base);
    for (let redirects = 0; ; redirects++) {
      if (!url.href.startsWith(base.href) || url.origin !== base.origin)
        throw new Error("redirect outside KB");
      const response = await (opts.fetch ?? fetch)(url, {
        redirect: "manual",
        headers: opts.token ? { authorization: `Bearer ${opts.token}` } : {},
        signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel();
        if (redirects >= 3) throw new Error("too many redirects");
        const location = response.headers.get("location");
        if (!location) throw new Error("invalid redirect");
        url = new URL(location, url);
        continue;
      }
      if (response.status === 404) return undefined;
      if (!response.ok)
        throw new Error(
          response.status === 401 ? "unauthorized" : `HTTP ${response.status}`,
        );
      const chunks: Uint8Array[] = [];
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          budget.bytes += value.length;
          if (budget.bytes > 20000000) {
            await reader.cancel();
            throw new Error("invalid index");
          }
          chunks.push(value);
        }
      }
      return Buffer.concat(chunks).toString("utf8");
    }
  };
  const refresh = async () => {
    if (manifestValue && (opts.now ?? Date.now)() < expires) return;
    const budget = { bytes: 0 };
    const text = await get("simp.md", budget);
    if (text === undefined) throw new Error("unreachable");
    const parsed = parseDoc("simp.md", text);
    if (
      parsed.parseError ||
      parsed.data.type !== "simp" ||
      typeof parsed.data.name !== "string" ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(parsed.data.name)
    )
      throw new Error("unreachable");
    if (name && name !== parsed.data.name)
      throw new Error(
        `peer name mismatch: expected ${name}, got ${parsed.data.name}`,
      );
    name = parsed.data.name;
    simpText = text;
    const index = await get("simp-index.yaml", budget);
    if (index !== undefined) {
      let files: string[];
      try {
        const parsedIndex = parseSimpIndex(index);
        if (parsedIndex.name !== name || parsedIndex.files.length > 5000)
          throw new Error();
        files = parsedIndex.files;
      } catch {
        throw new Error("invalid index");
      }
      if (index !== previousIndex || !loaded) {
        const records: Record<string, string> = { "simp.md": simpText };
        // Bound concurrency and bytes before parsing untrusted published content.
        for (let start = 0; start < files.length; start += 20)
          await Promise.all(
            files
              .slice(start, start + 20)
              .filter((p) => p !== "simp.md")
              .map(async (path) => {
                const content = await get(path, budget);
                if (content !== undefined) records[path] = content;
              }),
          );
        loaded = createPeerService({
          kb: await createKB(memorySource(records)),
          peers: [],
        });
        previousIndex = index;
      }
    } else {
      loaded = undefined;
      previousIndex = undefined;
    }
    const service =
      loaded ??
      createPeerService({
        kb: await createKB(memorySource({ "simp.md": simpText })),
        peers: [],
      });
    manifestValue = { ...(await service.manifest()), serves: ["pull"] };
    expires = (opts.now ?? Date.now)() + 60000;
  };
  return {
    get name() {
      return name;
    },
    async manifest() {
      await refresh();
      return manifestValue!;
    },
    async explore(req) {
      await refresh();
      return loaded
        ? loaded.explore({ ...req, trace: { ...req.trace, hops: 0 } })
        : { hits: [], goals: [], sources: [] };
    },
    async lookup(req) {
      await refresh();
      if (loaded)
        return loaded.lookup({ ...req, trace: { ...req.trace, hops: 0 } });
      const records: Record<string, string> = { "simp.md": simpText },
        budget = { bytes: Buffer.byteLength(simpText) };
      await Promise.all(
        req.ids.map(async (ref) => {
          const parsed = parseRef(ref);
          if (parsed.simp && parsed.simp !== name) return;
          const path = idToPath(parsed.id);
          if (!path || path === "simp.md") return;
          const content = await get(path, budget);
          if (content !== undefined) records[path] = content;
        }),
      );
      const service = createPeerService({
        kb: await createKB(memorySource(records)),
        peers: [],
      });
      const result = await service.lookup({
        ...req,
        trace: { ...req.trace, hops: 0 },
      });
      return {
        ...result,
        nodes: result.nodes.map((node) => ({ ...node, in: [] })),
      };
    },
  };
}

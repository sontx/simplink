import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Peer } from "@sontx/simplink-core";
import { httpPeer, type HttpPeerOptions } from "./http-peer.js";
import { staticPeer } from "./static-peer.js";
import { folderPeer } from "./folder-peer.js";
export interface OpenPeerOptions extends HttpPeerOptions {
  kbRoot?: string;
}

export function openPeer(url: string, opts: OpenPeerOptions = {}): Peer {
  if (!/^https?:/i.test(url))
    return folderPeer(
      url.startsWith("file:")
        ? fileURLToPath(url)
        : path.resolve(opts.kbRoot ?? process.cwd(), url),
      opts,
    );
  let selected: Peer | undefined,
    expires = 0,
    name = opts.name ?? "";
  const load = async () => {
    if (selected && (opts.now ?? Date.now)() < expires) return selected;
    const node = httpPeer(url, { ...opts, name: name || undefined });
    try {
      await node.manifest();
      selected = node;
    } catch (error) {
      if (
        /unsupported protocol|peer name mismatch|unauthorized/.test(
          (error as Error).message,
        )
      )
        throw error;
      selected = staticPeer(url, { ...opts, name: name || undefined });
      await selected.manifest();
    }
    name = selected.name;
    expires = (opts.now ?? Date.now)() + 60000;
    return selected;
  };
  return {
    get name() {
      return name;
    },
    manifest: async () => (await load()).manifest(),
    explore: async (req) => (await load()).explore(req),
    lookup: async (req) => (await load()).lookup(req),
    resolve: async (req) => {
      const p = await load();
      if (!p.resolve) throw new Error(`peer "${name}" does not serve delegate`);
      return p.resolve(req);
    },
  };
}

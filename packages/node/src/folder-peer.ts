import {
  createKB,
  createPeerService,
  simpDoc,
  type Peer,
} from "@sontx/simplink-core";
import type { HttpPeerOptions } from "./http-peer.js";
export function folderPeer(root: string, opts: HttpPeerOptions = {}): Peer {
  let name = opts.name ?? "",
    expires = 0,
    service: Peer | undefined;
  const load = async () => {
    if (service && (opts.now ?? Date.now)() < expires) return service;
    const kb = await createKB(root),
      doc = simpDoc(kb.graph);
    if (!doc) throw new Error("unreachable: KB has no simp.md");
    if (name && name !== doc.name)
      throw new Error(`peer name mismatch: expected ${name}, got ${doc.name}`);
    name = doc.name;
    const leaf = createPeerService({ kb, peers: [] });
    service = {
      name,
      manifest: async () => ({ ...(await leaf.manifest()), serves: ["pull"] }),
      explore: (req) =>
        leaf.explore({ ...req, trace: { ...req.trace, hops: 0 } }),
      lookup: (req) =>
        leaf.lookup({ ...req, trace: { ...req.trace, hops: 0 } }),
    };
    expires = (opts.now ?? Date.now)() + 60000;
    return service;
  };
  return {
    get name() {
      return name;
    },
    manifest: async () => (await load()).manifest(),
    explore: async (req) => (await load()).explore(req),
    lookup: async (req) => (await load()).lookup(req),
  };
}

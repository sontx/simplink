import path from "node:path";
import {
  createKB,
  createFederatedKB,
  simpDoc,
  type FederatedKB,
} from "@sontx/simplink-core";
import {
  openPeer,
  loadPeerConfig,
  parsePeerOverrides,
} from "@sontx/simplink-node";

export interface KBSourceArgs {
  kb?: string;
  simp?: string;
  simpToken?: string;
  noPeers: boolean;
  peer: string[];
  peerToken: string[];
  peerTimeout: number;
}

export class ArgumentError extends Error {}

export async function openFederatedKB(
  args: KBSourceArgs,
  env: NodeJS.ProcessEnv,
): Promise<FederatedKB> {
  if (args.kb !== undefined && args.simp !== undefined)
    throw new ArgumentError("--kb and --simp cannot be used together");
  if (!Number.isInteger(args.peerTimeout) || args.peerTimeout <= 0)
    throw new ArgumentError("--peer-timeout must be a positive integer");
  if (args.simp !== undefined) {
    const home = openPeer(args.simp, {
      token: args.simpToken ?? env.SIMP_TOKEN,
      timeoutMs: args.peerTimeout,
      kbRoot: process.cwd(),
    });
    try {
      await home.manifest();
    } catch (error) {
      throw new ArgumentError(
        `cannot reach simp at ${args.simp}: ${(error as Error).message}`,
      );
    }
    return createFederatedKB({ home });
  }
  const kbRoot = path.resolve(args.kb ?? env.KB_DIR ?? "kb");
  const local = await createKB(kbRoot);
  const doc = simpDoc(local.graph);
  if (!doc || args.noPeers) return createFederatedKB({ local });
  const overrides = parsePeerOverrides(
    { peer: args.peer, "peer-token": args.peerToken },
    env,
  );
  const { peers, modes } = loadPeerConfig(doc, overrides, {
    timeoutMs: args.peerTimeout,
    kbRoot,
  });
  return createFederatedKB({
    local,
    peers,
    modes,
    timeoutMs: args.peerTimeout,
  });
}

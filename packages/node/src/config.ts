import type { Peer, SimpDoc, ResolutionMode } from "@sontx/simplink-core";
import { openPeer } from "./open-peer.js";
export interface PeerOverrides {
  urls: Record<string, string>;
  tokens: Record<string, string>;
}

export function parsePeerOverrides(
  flags: { peer: string[]; "peer-token": string[] },
  env: NodeJS.ProcessEnv,
): PeerOverrides {
  const parse = (entries: string[]) =>
    Object.fromEntries(
      entries.map((entry) => {
        const i = entry.indexOf("=");
        if (
          i < 1 ||
          !entry.slice(i + 1) ||
          !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slice(0, i))
        )
          throw new Error(`invalid peer override: ${entry}`);
        return [entry.slice(0, i), entry.slice(i + 1)];
      }),
    );
  const tokens: Record<string, string> = {};
  for (const [key, value] of Object.entries(env))
    if (key.startsWith("SIMP_PEER_TOKEN_") && value)
      tokens[key.slice(16).toLowerCase().replaceAll("_", "-")] = value;
  return {
    urls: parse([
      ...(env.SIMP_PEERS?.split(",").filter(Boolean) ?? []),
      ...flags.peer,
    ]),
    tokens: { ...tokens, ...parse(flags["peer-token"]) },
  };
}

export function loadPeerConfig(
  doc: SimpDoc,
  overrides: PeerOverrides,
  opts: { timeoutMs: number; kbRoot?: string },
): { peers: Peer[]; modes: Record<string, ResolutionMode>; skipped: string[] } {
  const peers: Peer[] = [],
    modes: Record<string, ResolutionMode> = {},
    skipped: string[] = [];
  for (const decl of doc.peers) {
    const url = overrides.urls[decl.name] ?? decl.url;
    if (!url) {
      skipped.push(decl.name);
      continue;
    }
    peers.push(
      openPeer(url, {
        name: decl.name,
        token: overrides.tokens[decl.name],
        timeoutMs: opts.timeoutMs,
        kbRoot: opts.kbRoot,
      }),
    );
    if (decl.mode) modes[decl.name] = decl.mode;
  }
  return { peers, modes, skipped };
}

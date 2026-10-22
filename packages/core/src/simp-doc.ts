import type { KBGraph } from "./types.js";
export interface SimpPeerDecl {
  name: string;
  url?: string;
  mode?: "pull" | "delegate";
  docsUrl?: string;
}

export interface SimpDoc {
  name: string;
  title: string;
  summary: string;
  tags: string[];
  docsUrl?: string;
  serves: ("pull" | "delegate")[];
  peers: SimpPeerDecl[];
}

/** Reads the optional product manifest from a graph. */
export function simpDoc(graph: KBGraph): SimpDoc | undefined {
  const node = graph.nodes.get("simp");
  if (!node) return undefined;
  const d = node.data;
  return {
    name: typeof d.name === "string" ? d.name : "",
    title: node.title,
    summary: node.summary,
    tags: node.tags,
    ...(typeof d.docs_url === "string" ? { docsUrl: d.docs_url } : {}),
    serves: Array.isArray(d.serves)
      ? d.serves.filter(
          (s): s is "pull" | "delegate" => s === "pull" || s === "delegate",
        )
      : ["pull"],
    peers: Array.isArray(d.peers)
      ? d.peers.flatMap((p) =>
          p && typeof p.name === "string"
            ? [
                {
                  name: p.name,
                  ...(typeof p.url === "string" ? { url: p.url } : {}),
                  ...(p.mode === "pull" || p.mode === "delegate"
                    ? { mode: p.mode }
                    : {}),
                  ...(typeof p.docs_url === "string"
                    ? { docsUrl: p.docs_url }
                    : {}),
                },
              ]
            : [],
        )
      : [],
  };
}

import type { KBGraph } from "./types.js";
/** A peer declared in `simp.md`. */
export interface SimpPeerDecl {
  /** Peer simp name used in qualified references. */
  name: string;
  /** Simp node, static KB, `file:` URL, or folder path relative to the KB root. */
  url?: string;
  /** Preferred resolution mode; used only when the peer serves it. */
  mode?: "pull" | "delegate";
  /** Root of the peer's published graph-layout docs, used for remote doc links. */
  docsUrl?: string;
}

/** When and from which source revision the KB was last generated or updated. */
export interface SimpCheckpoint {
  /** ISO 8601 date or date-time of the last generate/update pass. */
  updatedAt?: string;
  /** Git commit of the product source the KB reflects; update passes diff from it. */
  commit?: string;
}

/** The product manifest read from a KB's root `simp.md`. */
export interface SimpDoc {
  /** Stable kebab-case simp name; empty when `simp.md` omits it. */
  name: string;
  /** Product title. */
  title: string;
  /** Product summary. */
  summary: string;
  /** Product tags. */
  tags: string[];
  /** Root of this product's published docs. */
  docsUrl?: string;
  /** Default language tag for generated docs and plan text, e.g. `vi`. */
  language?: string;
  /** Resolution modes this simp serves; defaults to `["pull"]`. */
  serves: ("pull" | "delegate")[];
  /** Declared peers. */
  peers: SimpPeerDecl[];
  /** Last generate/update checkpoint, used to sync only newer changes. */
  checkpoint?: SimpCheckpoint;
}

/** Reads the optional product manifest from a graph. */
export function simpDoc(graph: KBGraph): SimpDoc | undefined {
  const node = graph.nodes.get("simp");
  if (!node) return undefined;
  const d = node.data;
  const cp = d.checkpoint as Record<string, unknown> | null | undefined;
  const checkpoint: SimpCheckpoint | undefined =
    cp && typeof cp === "object" && !Array.isArray(cp)
      ? {
          ...(typeof cp.updated_at === "string"
            ? { updatedAt: cp.updated_at }
            : {}),
          ...(typeof cp.commit === "string" ? { commit: cp.commit } : {}),
        }
      : undefined;
  return {
    name: typeof d.name === "string" ? d.name : "",
    title: node.title,
    summary: node.summary,
    tags: node.tags,
    ...(typeof d.docs_url === "string" ? { docsUrl: d.docs_url } : {}),
    ...(typeof d.language === "string" ? { language: d.language } : {}),
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
    ...(checkpoint && Object.keys(checkpoint).length ? { checkpoint } : {}),
  };
}

import { dirname } from "./posix-path.js";
import { section } from "./markdown.js";
import type { KBGraph, KBNode, NodeImage } from "./types.js";

const IMAGE = /!\[([^\]\n]*)\]\(([^\s)]+)(?:\s+"[^"\n]*")?\)/g;
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i;
const ITEM = /^ {0,3}\d+\.\s+\S/;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

/** Whether a URL points into the KB rather than at a site, an absolute path, or an anchor. */
export const isLocalUrl = (url: string): boolean => !EXTERNAL.test(url);

/** A Markdown image written in prose. */
export interface BodyImage {
  /** Alt text as written; may be empty. */
  alt: string;
  /** URL as written, relative to the document or external. */
  url: string;
}

/** Lines with fenced code blanked (fences indented up to 3 spaces, as in list items) and inline code removed. */
function proseLines(md: string): string[] {
  let fenced = false;
  return md.split("\n").map((line) => {
    if (FENCE.test(line)) {
      fenced = !fenced;
      return "";
    }
    return fenced ? "" : line.replace(/`[^`\n]*`/g, "");
  });
}

const imagesIn = (line: string): BodyImage[] =>
  [...line.matchAll(IMAGE)].map((m) => ({ alt: m[1], url: m[2] }));

/** Markdown images in prose, ignoring code. */
export const bodyImages = (md: string): BodyImage[] =>
  proseLines(md).flatMap(imagesIn);

/**
 * KB-relative path of a local URL written in the document at `from`.
 * @returns undefined for external URLs and paths that leave the KB root.
 */
export function resolveAsset(from: string, url: string): string | undefined {
  if (EXTERNAL.test(url)) return undefined;
  const out: string[] = [];
  // Split before decoding so an escaped slash stays inside its segment, and decode each segment fully,
  // so `a%23b.png` names the file `a#b.png`.
  const parts = [
    ...dirname(from).split("/"),
    ...url
      .replace(/[?#].*$/, "")
      .split("/")
      .map(decodeSegment),
  ];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part !== "..") out.push(part);
    else if (!out.pop()) return undefined;
  }
  return out.length ? out.join("/") : undefined;
}

function decodeSegment(part: string): string {
  try {
    const decoded = decodeURIComponent(part);
    return decoded.includes("/") ? part : decoded;
  } catch {
    return part; // Malformed escapes stay as written.
  }
}

const local = (from: string, images: BodyImage[], step?: number) =>
  images.flatMap(({ alt, url }): NodeImage[] => {
    const src = resolveAsset(from, url);
    return src ? [{ src, alt, ...(step ? { step } : {}) }] : [];
  });

/**
 * Local images the resolver attaches to plan steps: a procedure's images in `## Steps`, numbered by
 * the item they are written in (none before the first item), or every image in a state's body.
 */
export function planImages(n: KBNode): NodeImage[] {
  if (n.type === "state") return local(n.path, bodyImages(n.body));
  const steps = n.type === "procedure" ? section(n.body, "Steps") : null;
  if (steps === null) return [];
  const prose = proseLines(steps);
  let step = 0;
  return steps.split("\n").flatMap((line, i) => {
    // Count items in code too: the resolver's step numbers (orderedItems) include them.
    if (ITEM.test(line)) step++;
    return local(n.path, imagesIn(prose[i]), step);
  });
}

// An image with the spaces around it, so removing it leaves at most one space and other spacing is untouched.
const SPACED_IMAGE = new RegExp(`([ \\t]*)${IMAGE.source}([ \\t]*)`, "g");

/** Step text without its local images, which the plan carries separately; inline code stays as written. */
export const withoutLocalImages = (text: string, from: string): string =>
  text
    .split(/(`[^`\n]*`)/)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(
            SPACED_IMAGE,
            (image, lead: string, _alt, url: string, trail: string) =>
              resolveAsset(from, url) ? (lead || trail ? " " : "") : image,
          ),
    )
    .join("")
    .trim();

/** KB-relative paths of the local images a node's body references. */
export const nodeAssets = (n: KBNode): string[] => [
  ...new Set(local(n.path, bodyImages(n.body)).map((i) => i.src)),
];

/**
 * Sorted KB-relative paths of the images a docs export references; copy them beside the pages at the same paths.
 * @param graph - Source graph (not a site layout graph): body URLs resolve against source paths.
 */
export const docAssets = (graph: KBGraph): string[] =>
  [...new Set([...graph.nodes.values()].flatMap(nodeAssets))]
    // Hidden paths (.env, .git/config) are never published, and Markdown is never an image: every exported page is
    // a .md file, so this also keeps an image from overwriting one. The KB source lists neither, so lint reports them missing.
    .filter(
      (src) =>
        !src.endsWith(".md") &&
        !src.split("/").some((part) => part.startsWith(".")),
    )
    .sort();

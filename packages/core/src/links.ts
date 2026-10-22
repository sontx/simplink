import { stripCode } from "./markdown.js";
export interface BodyLink {
  ref: string;
  fragment?: string;
  label?: string;
}

export function parseSimpUri(href: string): BodyLink | undefined {
  const m =
    /^simp:\/\/([a-z0-9]+(?:-[a-z0-9]+)*)?(?:\/([^#?\s]*))?(?:#([^\s]*))?$/.exec(
      href,
    );
  if (!m || (!m[1] && !m[2])) return undefined;
  const id = m[2] || "simp";
  return {
    ref: m[1] ? `${m[1]}:${id}` : id,
    ...(m[3] !== undefined ? { fragment: m[3] } : {}),
  };
}

export function extractBodyLinks(body: string): BodyLink[] {
  const links = new Map<string, BodyLink>();
  for (const m of stripCode(body).matchAll(
    /\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]|\[([^\]\n]*)\]\((simp:\/\/[^\s)]*)\)/g,
  )) {
    const link =
      m[1] !== undefined
        ? {
            ref: m[1].trim(),
            ...(m[2] !== undefined ? { fragment: m[2] } : {}),
            ...(m[3] !== undefined ? { label: m[3] } : {}),
          }
        : parseSimpUri(m[5]);
    if (link && !links.has(link.ref))
      links.set(link.ref, {
        ...link,
        ...(m[4] !== undefined ? { label: m[4] } : {}),
      });
  }
  return [...links.values()];
}

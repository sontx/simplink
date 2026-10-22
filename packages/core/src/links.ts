import { stripCode } from "./markdown.js";
/** A node link found in Markdown prose. */
export interface BodyLink {
  /** Target reference, qualified (`crm:goal.x`) when it points at another simp. */
  ref: string;
  /** Heading fragment after `#`, without the `#`. */
  fragment?: string;
  /** Link text, or the wikilink alias after `|`. */
  label?: string;
}

/**
 * Parses a `simp://` URI: `simp://crm/goal.x#steps` targets another simp,
 * `simp:///goal.x` the current KB, and `simp://crm` that simp's homepage
 * (`simp`). Returns `undefined` for anything else.
 */
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

/**
 * Finds `[[wikilinks]]` and `[text](simp://…)` links outside code, keeping the
 * first link per target reference.
 */
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

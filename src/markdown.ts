/** Removes fenced and inline code so examples are not treated as links or steps. */
export const stripCode = (md: string): string =>
  md.replace(/^(```|~~~)[\s\S]*?^\1\s*$/gm, "").replace(/`[^`\n]*`/g, "");

/** Content of a "## <heading>" section, up to the next h1/h2. Null if absent. */
export function section(body: string, heading: string): string | null {
  const m = new RegExp(`^##\\s+${heading}\\s*$`, "im").exec(body);
  if (!m) return null;
  const rest = body.slice(m.index + m[0].length);
  const next = /^#{1,2}\s/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** Top-level ordered list items ("1. text"), number stripped. */
export const orderedItems = (text: string): string[] =>
  [...text.matchAll(/^ {0,3}\d+\.\s+(.+)$/gm)].map((m) => m[1].trim());

/** Rough token estimate (chars / 4). */
export const estimateTokens = (s: string): number => Math.ceil(s.length / 4);

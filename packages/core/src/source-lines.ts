/**
 * Maps frontmatter fields and body text of one Markdown document to 1-based
 * source lines. Block-style YAML is located exactly; flow collections and
 * unusual layouts fall back to the deepest key that was found.
 */
export interface SourceLocator {
  /**
   * Line of a frontmatter field, e.g. `["availability", "plans", 0]`.
   * @returns The field line, the deepest found ancestor, or undefined when the first key is absent.
   */
  field(path: readonly (string | number)[]): number | undefined;
  /** First frontmatter line containing `text`. */
  frontmatterText(text: string): number | undefined;
  /** First body line containing `text`. */
  bodyText(text: string): number | undefined;
}

const FENCE = /^---[^\S\r\n]*$/;
const BYTE_ORDER_MARK = 0xfeff;
const CONTENT = /^\s*[^\s#]/;
const DASH = /^(\s*)-(?:\s|$)/;

/**
 * Creates a line locator for a document's raw Markdown text.
 * @param raw - Full file content, including frontmatter.
 * @returns Locator whose lines count from 1 at the top of the file.
 */
export function locateSource(raw: string): SourceLocator {
  const lines = raw.split(/\r?\n/);
  const first = lines[0] ?? "";
  const hasFrontmatter = FENCE.test(
    first.charCodeAt(0) === BYTE_ORDER_MARK ? first.slice(1) : first,
  );
  const close = hasFrontmatter
    ? lines.findIndex((line, i) => i > 0 && FENCE.test(line))
    : -1;
  const fmStart = hasFrontmatter ? 1 : 0;
  const fmEnd = hasFrontmatter ? (close < 0 ? lines.length : close) : 0;
  const bodyStart = hasFrontmatter ? (close < 0 ? lines.length : close + 1) : 0;

  const indent = (line: string) => line.length - line.trimStart().length;
  // Column of the key on a line, counting "- " list markers as indentation.
  const keyColumn = (line: string) => {
    const dash = DASH.exec(line);
    if (!dash) return indent(line);
    const rest = line.slice(dash[0].length);
    return dash[0].length + (rest.length - rest.trimStart().length);
  };
  const blockEnd = (start: number, column: number, item: boolean) => {
    for (let i = start + 1; i < fmEnd; i++) {
      if (!CONTENT.test(lines[i])) continue;
      const col = indent(lines[i]);
      // A key's list items may sit at the key's own column.
      if (col < column || (col === column && (item || !DASH.test(lines[i]))))
        return i;
    }
    return fmEnd;
  };

  return {
    field(path) {
      let from = fmStart;
      let to = fmEnd;
      let found: number | undefined;
      for (const segment of path) {
        let hit = -1;
        if (typeof segment === "string") {
          const first = lines.slice(from, to).findIndex((l) => CONTENT.test(l));
          if (first < 0) break;
          const column = keyColumn(lines[from + first]);
          const key = new RegExp(
            `^["']?${segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']?\\s*:(?:\\s|$)`,
          );
          for (let i = from; i < to; i++)
            if (
              CONTENT.test(lines[i]) &&
              keyColumn(lines[i]) === column &&
              key.test(lines[i].slice(column))
            ) {
              hit = i;
              break;
            }
          if (hit < 0) break;
          from = hit + 1;
          to = blockEnd(hit, keyColumn(lines[hit]), false);
        } else {
          let column = -1;
          let count = 0;
          for (let i = from; i < to; i++) {
            const dash = DASH.exec(lines[i]);
            if (!dash) continue;
            if (column < 0) column = dash[1].length;
            if (dash[1].length !== column) continue;
            if (count++ === segment) {
              hit = i;
              break;
            }
          }
          if (hit < 0) break;
          from = hit;
          to = blockEnd(hit, column, true);
        }
        found = hit;
      }
      return found === undefined ? undefined : found + 1;
    },
    frontmatterText(text) {
      for (let i = fmStart; i < fmEnd; i++)
        if (lines[i].includes(text)) return i + 1;
      return undefined;
    },
    bodyText(text) {
      for (let i = bodyStart; i < lines.length; i++)
        if (lines[i].includes(text)) return i + 1;
      return undefined;
    },
  };
}

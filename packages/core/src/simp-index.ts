import matter from "gray-matter";
import { loadDocs, deriveId } from "./loader.js";
import { idToPath } from "./ids.js";
import type { DocSource } from "./source.js";
// gray-matter exposes its bundled YAML engine at runtime but omits it from declarations.
const yaml = (
  matter as typeof matter & {
    engines: {
      yaml: { parse(text: string): unknown; stringify(value: unknown): string };
    };
  }
).engines.yaml;
/** File name of the optional static publishing index at the KB root. */
export const SIMP_INDEX_FILE = "simp-index.yaml";

/** Static publishing index that lets static peers search a KB. */
export interface SimpIndex {
  /** Index format version. */
  protocol: 1;
  /** Simp name from `simp.md`. */
  name: string;
  /** Sorted node file paths relative to the KB root. */
  files: string[];
}

/**
 * Lists a KB's node files for static publishing. Markdown files that are not
 * node files are left out.
 *
 * @throws Error when the KB has no `simp.md`.
 */
export async function buildSimpIndex(source: DocSource): Promise<SimpIndex> {
  const docs = await loadDocs(source);
  const simp = docs.find((d) => d.relPath === "simp.md");
  if (!simp) throw new Error("KB has no simp.md");
  const index = {
    protocol: 1 as const,
    name: simp.data.name as string,
    // Only node files: lint reports stray Markdown, the index must not reject itself.
    files: docs
      .map((d) => d.relPath)
      .filter((file) => idToPath(deriveId(file).derivedId ?? "") === file)
      .sort(),
  };
  return parseSimpIndex(formatSimpIndex(index));
}

/** Serializes an index as YAML for {@link SIMP_INDEX_FILE}. */
export function formatSimpIndex(index: SimpIndex): string {
  return yaml.stringify(index);
}

/**
 * Parses and validates an index. Every file must be a node path inside the
 * KB, which rejects traversal and absolute or remote URLs.
 *
 * @throws Error prefixed `invalid index:` when validation fails.
 */
export function parseSimpIndex(text: string): SimpIndex {
  try {
    const value = yaml.parse(text) as SimpIndex;
    if (!value || typeof value !== "object" || value.protocol !== 1)
      throw new Error("protocol must be 1");
    if (
      typeof value.name !== "string" ||
      !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value.name)
    )
      throw new Error("invalid name");
    if (
      !Array.isArray(value.files) ||
      value.files.some(
        (file) =>
          typeof file !== "string" ||
          idToPath(deriveId(file).derivedId ?? "") !== file,
      )
    )
      throw new Error("invalid file path");
    return { protocol: 1, name: value.name, files: value.files };
  } catch (error) {
    throw new Error(`invalid index: ${(error as Error).message}`);
  }
}

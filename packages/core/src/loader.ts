import matter from "gray-matter";
import type { DocSource } from "./source.js";
import { fsSource } from "./platform.js";
import { FOLDER_TO_TYPE, type NodeType } from "./types.js";

/**
 * Parsed source document before schema validation; parse failures are preserved as diagnostics.
 */
export interface RawDoc {
  /** Source path relative to the KB root, using POSIX separators. */
  relPath: string;
  /** Undefined when the top-level folder is not a known type folder. */
  folderType?: NodeType;
  /** Undefined when the path cannot produce a valid id. */
  derivedId?: string;
  /** Parsed YAML frontmatter. */
  data: Record<string, unknown>;
  /** Markdown body without YAML frontmatter. */
  body: string;
  /** YAML or missing-frontmatter diagnostic; omitted when parsing succeeds. */
  parseError?: string;
}

const ID_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Derives a node type and identifier from a relative POSIX document path.
 * @param relPath - Path relative to the KB root, e.g. procedures/broadcast/send-zalo.md.
 * @returns Folder type and dot-separated identifier; invalid paths leave one or both undefined. */
export function deriveId(relPath: string): {
  folderType?: NodeType;
  derivedId?: string;
} {
  if (relPath === "simp.md") return { folderType: "simp", derivedId: "simp" };
  const [folder, ...rest] = relPath.replace(/\.md$/, "").split("/");
  const folderType = FOLDER_TO_TYPE[folder];
  if (!folderType || rest.length === 0) return { folderType };
  // Dots in file names would collide with folder nesting, so they are invalid.
  if (!rest.every((s) => ID_SEGMENT.test(s))) return { folderType };
  return { folderType, derivedId: [folderType, ...rest].join(".") };
}

/** Parses one document, preserving YAML diagnostics for linting.
 * @param relPath - Relative POSIX source path used to derive the identifier.
 * @param raw - Markdown text including frontmatter.
 * @returns Parsed document; malformed or missing frontmatter sets parseError rather than throwing. */
export function parseDoc(relPath: string, raw: string): RawDoc {
  const ids = deriveId(relPath);
  try {
    const parsed = matter(raw, {});
    return {
      relPath,
      ...ids,
      data: parsed.data ?? {},
      body: parsed.content,
      ...(!raw.trimStart().startsWith("---")
        ? { parseError: "missing frontmatter block" }
        : {}),
    };
  } catch (err) {
    return {
      relPath,
      ...ids,
      data: {},
      body: "",
      parseError: (err as Error).message.split("\n")[0],
    };
  }
}

/** Loads and parses visible Markdown documents in deterministic path order.
 * @param input - Filesystem root or custom document source.
 * @returns Parsed documents; root-level and hidden files are excluded.
 * @throws If any source path is invalid or duplicated, or source loading fails. */
export async function loadDocs(input: string | DocSource): Promise<RawDoc[]> {
  const files = await (
    typeof input === "string" ? fsSource(input) : input
  ).list();
  const seen = new Set<string>();
  for (const { relPath } of files) {
    if (
      !relPath ||
      relPath.includes("\\") ||
      /^[A-Za-z]:/.test(relPath) ||
      relPath.split("/").some((s) => !s || s === "." || s === "..")
    ) {
      throw new Error(
        `Invalid source path "${relPath}": expected a relative /-separated path`,
      );
    }
    if (seen.has(relPath))
      throw new Error(`Duplicate source path "${relPath}"`);
    seen.add(relPath);
  }
  return files
    .filter(
      (f) =>
        f.relPath.endsWith(".md") &&
        (f.relPath === "simp.md" || f.relPath.includes("/")) &&
        !f.relPath.split("/").some((s) => s.startsWith(".")),
    )
    .sort((a, b) =>
      a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0,
    )
    .map((f) => parseDoc(f.relPath, f.content));
}

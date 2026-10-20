import matter from "gray-matter";
import { fsSource, type DocSource } from "./source.js";
import { FOLDER_TO_TYPE, type NodeType } from "./types.js";

export interface RawDoc {
  relPath: string;
  /** Undefined when the top-level folder is not a known type folder. */
  folderType?: NodeType;
  /** Undefined when the path cannot produce a valid id. */
  derivedId?: string;
  data: Record<string, unknown>;
  body: string;
  parseError?: string;
}

const ID_SEGMENT = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** kb/procedures/broadcast/send-zalo.md -> procedure.broadcast.send-zalo */
export function deriveId(relPath: string): { folderType?: NodeType; derivedId?: string } {
  const [folder, ...rest] = relPath.replace(/\.md$/, "").split("/");
  const folderType = FOLDER_TO_TYPE[folder];
  if (!folderType || rest.length === 0) return { folderType };
  // Dots in file names would collide with folder nesting, so they are invalid.
  if (!rest.every((s) => ID_SEGMENT.test(s))) return { folderType };
  return { folderType, derivedId: [folderType, ...rest].join(".") };
}

/** Parse one document, preserving YAML diagnostics for linting. */
export function parseDoc(relPath: string, raw: string): RawDoc {
  const ids = deriveId(relPath);
  try {
    const parsed = matter(raw, {});
    return { relPath, ...ids, data: parsed.data ?? {}, body: parsed.content,
      ...(!raw.trimStart().startsWith("---") ? { parseError: "missing frontmatter block" } : {}) };
  } catch (err) {
    return { relPath, ...ids, data: {}, body: "", parseError: (err as Error).message.split("\n")[0] };
  }
}

/** Source paths are relative POSIX paths, even on Windows. */
export async function loadDocs(input: string | DocSource): Promise<RawDoc[]> {
  const files = await (typeof input === "string" ? fsSource(input) : input).list();
  const seen = new Set<string>();
  for (const { relPath } of files) {
    if (!relPath || relPath.includes("\\") || /^[A-Za-z]:/.test(relPath) ||
        relPath.split("/").some(s => !s || s === "." || s === "..")) {
      throw new Error(`Invalid source path "${relPath}": expected a relative /-separated path`);
    }
    if (seen.has(relPath)) throw new Error(`Duplicate source path "${relPath}"`);
    seen.add(relPath);
  }
  return files.filter(f => f.relPath.endsWith(".md") && f.relPath.includes("/") &&
    !f.relPath.split("/").some(s => s.startsWith(".")))
    .sort((a, b) => a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0)
    .map(f => parseDoc(f.relPath, f.content));
}

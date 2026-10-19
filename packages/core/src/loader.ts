import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
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

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** kb/procedures/broadcast/send-zalo.md -> procedure.broadcast.send-zalo */
export function deriveId(relPath: string): { folderType?: NodeType; derivedId?: string } {
  const [folder, ...rest] = relPath.replace(/\.md$/, "").split("/");
  const folderType = FOLDER_TO_TYPE[folder];
  if (!folderType || rest.length === 0) return { folderType };
  // Dots in file names would collide with folder nesting, so they are invalid.
  if (!rest.every((s) => ID_SEGMENT.test(s))) return { folderType };
  return { folderType, derivedId: [folderType, ...rest].join(".") };
}

/** Reads every .md file under the KB root except files directly in the root (e.g. index.md). */
export async function loadDocs(root: string): Promise<RawDoc[]> {
  const files = (await walk(root)).sort();
  const docs: RawDoc[] = [];
  for (const abs of files) {
    const relPath = path.relative(root, abs).split(path.sep).join("/");
    if (!relPath.includes("/")) continue;
    const raw = await readFile(abs, "utf8");
    const ids = deriveId(relPath);
    try {
      // Empty options object disables gray-matter's content cache.
      const parsed = matter(raw, {});
      if (!raw.trimStart().startsWith("---")) {
        docs.push({ relPath, ...ids, data: {}, body: parsed.content, parseError: "missing frontmatter block" });
        continue;
      }
      docs.push({ relPath, ...ids, data: parsed.data ?? {}, body: parsed.content });
    } catch (err) {
      docs.push({ relPath, ...ids, data: {}, body: "", parseError: (err as Error).message.split("\n")[0] });
    }
  }
  return docs;
}

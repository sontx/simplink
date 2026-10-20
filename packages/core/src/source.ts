import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { MaybePromise } from "./types.js";

export interface SourceFile {
  relPath: string;
  content: string;
}

export interface DocSource {
  name?: string;
  list(): MaybePromise<SourceFile[]>;
}

export function fsSource(root: string): DocSource {
  return {
    name: root,
    async list() {
      const files: SourceFile[] = [];
      async function walk(dir: string): Promise<void> {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
          if (entry.name.startsWith(".")) continue;
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) await walk(full);
          else if (entry.isFile() && entry.name.endsWith(".md")) {
            files.push({
              relPath: path.relative(root, full).split(path.sep).join("/"),
              content: await readFile(full, "utf8"),
            });
          }
        }
      }
      await walk(root);
      return files;
    },
  };
}

export function memorySource(
  files: Record<string, string>,
  name = "<memory>",
): DocSource {
  return {
    name,
    list: () =>
      Object.entries(files).map(([relPath, content]) => ({ relPath, content })),
  };
}

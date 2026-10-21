import { readdir, readFile } from "node:fs/promises";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DocSource, SourceFile } from "./source.js";
import { compileValidator, type FrontmatterValidator } from "./schema.js";

/** Absolute path to the bundled JSON schema directory, usable from source and built modules. */
export const SCHEMA_DIR = fileURLToPath(
  new URL("../schemas/", import.meta.url),
);

/**
 * Loads and compiles the bundled JSON schemas for all node types.
 * @param schemaDir - Schema directory; defaults to SCHEMA_DIR.
 * @returns A reusable synchronous frontmatter validator.
 * @throws If schemas cannot be read or compiled, or a required node schema is missing.
 */
export function createValidator(schemaDir = SCHEMA_DIR): FrontmatterValidator {
  return compileValidator(
    readdirSync(schemaDir)
      .filter((file) => file.endsWith(".schema.json"))
      .map((file) =>
        JSON.parse(readFileSync(path.join(schemaDir, file), "utf8")),
      ),
  );
}

export function defaultValidator(): FrontmatterValidator {
  return createValidator();
}

/**
 * Creates a filesystem source that recursively reads UTF-8 .md files, skipping hidden entries.
 * @param root - Knowledge-base directory.
 * @returns A lazy source; filesystem errors reject its list call.
 */
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

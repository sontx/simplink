import { readdir, readFile, realpath, stat } from "node:fs/promises";
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
 * Its `assets` lists the other visible files, so lint can check image paths, and
 * `read` reads one of them as text, resolving `undefined` when it is missing.
 * @param root - Knowledge-base directory.
 * @returns A lazy source; filesystem errors reject its list and assets calls.
 */
export function fsSource(root: string): DocSource {
  async function walk(dir: string, out: string[] = []): Promise<string[]> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, out);
      else if (
        entry.isFile() ||
        // Symlinked documents stay unread, as before; symlinked images are listed for lint.
        (entry.isSymbolicLink() &&
          !entry.name.endsWith(".md") &&
          (await isInside(full)))
      )
        out.push(path.relative(root, full).split(path.sep).join("/"));
    }
    return out;
  }
  // A symlinked file counts only when it resolves to a file inside the KB, the same rule simp-docs copies by.
  let realRoot: Promise<string> | undefined;
  async function isInside(full: string): Promise<boolean> {
    try {
      const [target, base] = await Promise.all([
        realpath(full),
        (realRoot ??= realpath(root)),
      ]);
      const rel = path.relative(base, target);
      return (
        rel !== "" &&
        !rel.startsWith("..") &&
        !path.isAbsolute(rel) &&
        (await stat(target)).isFile()
      );
    } catch {
      return false; // Dangling links count as missing.
    }
  }
  // list() hands its walk to the next assets() call, so lint reads the directory tree once.
  let lastWalk: Promise<string[]> | undefined;
  return {
    name: root,
    async list(): Promise<SourceFile[]> {
      const files: SourceFile[] = [];
      lastWalk = walk(root);
      for (const relPath of await lastWalk)
        if (relPath.endsWith(".md"))
          files.push({
            relPath,
            content: await readFile(path.join(root, relPath), "utf8"),
          });
      return files;
    },
    async assets() {
      const paths = lastWalk ?? walk(root);
      lastWalk = undefined;
      return (await paths).filter((f) => !f.endsWith(".md"));
    },
    async read(relPath) {
      if (
        !relPath ||
        relPath.includes("\\") ||
        path.isAbsolute(relPath) ||
        /^[A-Za-z]:/.test(relPath) ||
        relPath.split("/").some((s) => !s || s === "." || s === "..")
      )
        throw new Error(`Invalid source path "${relPath}"`);
      try {
        return await readFile(path.join(root, relPath), "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return undefined;
        throw error;
      }
    },
  };
}

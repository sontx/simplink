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
export const SIMP_INDEX_FILE = "simp-index.yaml";

export interface SimpIndex {
  protocol: 1;
  name: string;
  files: string[];
}

export async function buildSimpIndex(source: DocSource): Promise<SimpIndex> {
  const docs = await loadDocs(source);
  const simp = docs.find((d) => d.relPath === "simp.md");
  if (!simp) throw new Error("KB has no simp.md");
  const index = {
    protocol: 1 as const,
    name: simp.data.name as string,
    files: docs.map((d) => d.relPath).sort(),
  };
  return parseSimpIndex(formatSimpIndex(index));
}

export function formatSimpIndex(index: SimpIndex): string {
  return yaml.stringify(index);
}

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

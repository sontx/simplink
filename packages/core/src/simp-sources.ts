import matter from "gray-matter";
import { idToPath } from "./ids.js";
// gray-matter exposes its bundled YAML engine at runtime but omits it from declarations.
const yaml = (
  matter as typeof matter & {
    engines: {
      yaml: { parse(text: string): unknown; stringify(value: unknown): string };
    };
  }
).engines.yaml;

/**
 * File name of the optional authoring sidecar at the KB root. It maps node IDs
 * to the repo paths or doc URLs they were derived from, so update passes can
 * find nodes affected by a change. Simplink never serves it: node lookups,
 * static peers, the KB proxy, and docs export all leave it out.
 */
export const SIMP_SOURCES_FILE = "simp-sources.yaml";

/** Node ID to the repo paths or doc URLs the node was derived from. */
export type SimpSources = Record<string, string[]>;

/**
 * Parses and validates a {@link SIMP_SOURCES_FILE}. An empty document is an
 * empty map. Keys must be local node IDs and values non-empty lists of
 * non-empty strings.
 *
 * @throws Error prefixed `invalid sources:` when validation fails.
 */
export function parseSimpSources(text: string): SimpSources {
  try {
    const value = yaml.parse(text);
    if (value === null || value === undefined) return {};
    if (typeof value !== "object" || Array.isArray(value))
      throw new Error("expected a mapping of node IDs to source lists");
    const out: SimpSources = {};
    for (const [id, list] of Object.entries(value)) {
      if (idToPath(id) === undefined)
        throw new Error(`"${id}" is not a local node ID`);
      if (
        !Array.isArray(list) ||
        !list.length ||
        list.some((s) => typeof s !== "string" || !s.trim())
      )
        throw new Error(`"${id}" must list one or more non-empty strings`);
      out[id] = list as string[];
    }
    return out;
  } catch (error) {
    throw new Error(`invalid sources: ${(error as Error).message}`);
  }
}

/** Serializes sources as YAML for {@link SIMP_SOURCES_FILE}, with sorted keys. */
export function formatSimpSources(sources: SimpSources): string {
  const sorted = Object.fromEntries(
    Object.keys(sources)
      .sort()
      .map((id) => [id, sources[id]]),
  );
  return Object.keys(sorted).length ? yaml.stringify(sorted) : "{}\n";
}

/** 1-based line of a top-level key in a sources file, if found. */
export function simpSourcesLine(text: string, id: string): number | undefined {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((line) => {
    const m = /^(["']?)([^"':\s][^"':]*)\1\s*:/.exec(line);
    return m?.[2] === id;
  });
  return i < 0 ? undefined : i + 1;
}

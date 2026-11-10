import { idToPath } from "./ids.js";
import { yaml, yamlErrorLine } from "./yaml.js";

/**
 * File name of the optional authoring sidecar at the KB root. It maps node IDs
 * to the repo paths or doc URLs they were derived from, so update passes can
 * find nodes affected by a change. Simplink never serves it: node lookups,
 * static peers, the KB proxy, and docs export all leave it out.
 */
export const SIMP_SOURCES_FILE = "simp-sources.yaml";

/** Node ID to the repo paths or doc URLs the node was derived from. */
export type SimpSources = Record<string, string[]>;

/** A {@link SIMP_SOURCES_FILE} validation failure, with its 1-based line when known. */
export class SimpSourcesError extends Error {
  constructor(
    message: string,
    readonly line?: number,
  ) {
    super(`invalid sources: ${message}`);
  }
}

/**
 * Parses and validates a {@link SIMP_SOURCES_FILE}. An empty document is an
 * empty map. Keys must be local node IDs and values non-empty lists of
 * non-empty strings.
 *
 * @throws {@link SimpSourcesError} (message prefixed `invalid sources:`) when validation fails.
 */
export function parseSimpSources(text: string): SimpSources {
  let value: unknown;
  try {
    value = yaml.parse(text);
  } catch (error) {
    throw new SimpSourcesError((error as Error).message, yamlErrorLine(error));
  }
  if (value === null || value === undefined) return {};
  if (typeof value !== "object" || Array.isArray(value))
    throw new SimpSourcesError(
      "expected a mapping of node IDs to source lists",
    );
  const out: SimpSources = {};
  for (const [id, list] of Object.entries(value)) {
    const fail = (message: string) =>
      new SimpSourcesError(message, simpSourcesLine(text, id));
    if (idToPath(id) === undefined)
      throw fail(`"${id}" is not a local node ID`);
    if (!Array.isArray(list) || !list.length)
      throw fail(`"${id}" must list one or more non-empty strings`);
    for (const s of list) {
      if (typeof s === "string" && s.trim()) continue;
      // YAML reads bare 404, 1.10, or 2024-01-01 as numbers and dates, which
      // can't be turned back into the text that was written.
      throw fail(
        typeof s === "number" || typeof s === "boolean" || s instanceof Date
          ? `"${id}" lists a ${s instanceof Date ? "date" : typeof s}, not a string; quote it`
          : `"${id}" must list one or more non-empty strings`,
      );
    }
    out[id] = list as string[];
  }
  return out;
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
    // Block-style keys, optionally spaced before the colon. Flow mappings
    // ({goal.a: [x]}) are valid but report no line.
    const m = /^(["']?)([^"':\s][^"':]*?)\1\s*:/.exec(line);
    return m?.[2] === id;
  });
  return i < 0 ? undefined : i + 1;
}

import type { MaybePromise } from "./types.js";

/**
 * One source document, with a path relative to the knowledge-base root.
 */
export interface SourceFile {
  /** Unique relative POSIX path, such as goals/send-message.md; no empty, dot, or parent segments. */
  relPath: string;
  /** Full Markdown source including YAML frontmatter. */
  content: string;
}

/**
 * Pluggable document provider consumed by loading, linting, and KB creation.
 */
export interface DocSource {
  /** Optional source label used in KB status and diagnostics. */
  name?: string;
  /** Returns all source files synchronously or asynchronously. Paths must be unique relative POSIX paths. */
  list(): MaybePromise<SourceFile[]>;
}

/**
 * Creates a source backed by a path-to-Markdown record.
 * @param files - Document contents keyed by relative POSIX paths.
 * @param name - Source label used in status output; defaults to <memory>.
 * @returns A source whose list method reads the supplied record.
 */
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

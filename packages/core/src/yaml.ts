import matter from "gray-matter";

/** js-yaml error position, 0-based, as gray-matter's bundled engine reports it. */
interface YamlMark {
  line?: number;
}

// gray-matter exposes its bundled YAML engine at runtime but omits it from declarations.
export const yaml = (
  matter as typeof matter & {
    engines: {
      yaml: { parse(text: string): unknown; stringify(value: unknown): string };
    };
  }
).engines.yaml;

/** 1-based line of a YAML parse error, if the error carries one. */
export function yamlErrorLine(error: unknown): number | undefined {
  const line = (error as { mark?: YamlMark } | null)?.mark?.line;
  return typeof line === "number" ? line + 1 : undefined;
}

import { parseArgs } from "node:util";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildSimpIndex,
  formatSimpIndex,
  SIMP_INDEX_FILE,
} from "../simp-index.js";
import { fsSource } from "../platform.js";
import type { CliContext } from "./context.js";
export async function runIndex(
  argv: string[],
  ctx: CliContext = {},
): Promise<number> {
  const stdout = ctx.stdout ?? console.log;
  const stderr = ctx.stderr ?? console.error;
  let root = "kb";
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { help: { type: "boolean", short: "h" } },
    });
    if (values.help) {
      stdout("Usage: simp-index [kb]");
      return 0;
    }
    if (positionals.length > 1)
      throw new Error("Expected at most one KB directory");
    root = positionals[0] ?? "kb";
    const index = await buildSimpIndex(fsSource(path.resolve(root)));
    const output = path.join(root, SIMP_INDEX_FILE);
    await writeFile(output, formatSimpIndex(index));
    stdout(`wrote ${output} (${index.files.length} files)`);
    return 0;
  } catch (error) {
    stderr(
      (error as Error).message === "KB has no simp.md"
        ? `KB at ${root} has no simp.md`
        : (error as Error).message,
    );
    return 2;
  }
}

import { parseArgs } from "node:util";
import { lintKB } from "../lint.js";

import { type CliContext, integerOption, formatOption } from "./context.js";

/**
 * Runs the lint CLI without terminating the host process.
 * @param argv - Command arguments excluding the Node executable and script path; use --help for supported options.
 * @param ctx - Output callbacks (default console) and KB extensions.
 * @returns Process-style exit code; failures are written to stderr.
 */
export async function runLint(
  argv: string[],
  ctx: CliContext = {},
): Promise<number> {
  const stdout = ctx.stdout ?? console.log;
  const stderr = ctx.stderr ?? console.error;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        format: { type: "string", default: "text" },
        "max-warnings": { type: "string", default: "-1" },
        quiet: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });

    if (values.help) {
      stdout(`Usage: simp-lint [dir=kb] [--format text|json] [--max-warnings N] [--quiet]

  --format        text (default) or json
  --max-warnings  fail when warnings exceed N (default: -1, never)
  --quiet         report errors only
Exit code 1 on any error or when --max-warnings is exceeded.`);
      return 0;
    }

    const root = positionals[0] ?? "kb";
    formatOption(values.format, ["text", "json"]);
    if (positionals.length > 1) throw new Error("Expected one KB directory");
    const maxWarnings = integerOption(
      values["max-warnings"],
      "max-warnings",
      -1,
    );
    const result = await lintKB(root, {
      ...ctx.extensions?.lint,
      validator: ctx.extensions?.validator,
    });
    const shown = values.quiet
      ? result.issues.filter((i) => i.severity === "error")
      : result.issues;

    if (values.format === "json") {
      stdout(
        JSON.stringify(
          {
            root,
            nodes: result.graph.nodes.size,
            edges: result.graph.edges.length,
            errors: result.errorCount,
            warnings: result.warningCount,
            issues: shown,
          },
          null,
          2,
        ),
      );
    } else {
      let current = "";
      for (const i of shown) {
        if (i.path !== current) {
          current = i.path;
          stdout(`\n${i.path}`);
        }
        stdout(`  ${i.code}  ${i.message}`);
      }
      const mark = result.errorCount ? "✖" : "✔";
      stdout(
        `\n${mark} ${result.graph.nodes.size} nodes, ${result.graph.edges.length} edges — ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
      );
    }

    const tooManyWarnings =
      maxWarnings >= 0 && result.warningCount > maxWarnings;
    return result.errorCount > 0 || tooManyWarnings ? 1 : 0;
  } catch (err) {
    stderr((err as Error).message);
    return 2;
  }
}

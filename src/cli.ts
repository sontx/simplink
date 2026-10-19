#!/usr/bin/env node
import { parseArgs } from "node:util";
import { lintKB } from "./index.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    format: { type: "string", default: "text" },
    "max-warnings": { type: "string", default: "-1" },
    quiet: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) {
  console.log(`Usage: simp-lint [dir=kb] [--format text|json] [--max-warnings N] [--quiet]

  --format        text (default) or json
  --max-warnings  fail when warnings exceed N (default: -1, never)
  --quiet         report errors only
Exit code 1 on any error or when --max-warnings is exceeded.`);
  process.exit(0);
}

const root = positionals[0] ?? "kb";
const maxWarnings = Number(values["max-warnings"]);
const result = await lintKB(root);
const shown = values.quiet ? result.issues.filter((i) => i.severity === "error") : result.issues;

if (values.format === "json") {
  console.log(
    JSON.stringify(
      { root, nodes: result.graph.nodes.size, edges: result.graph.edges.length, errors: result.errorCount, warnings: result.warningCount, issues: shown },
      null,
      2,
    ),
  );
} else {
  let current = "";
  for (const i of shown) {
    if (i.path !== current) {
      current = i.path;
      console.log(`\n${i.path}`);
    }
    console.log(`  ${i.code}  ${i.message}`);
  }
  const mark = result.errorCount ? "✖" : "✔";
  console.log(
    `\n${mark} ${result.graph.nodes.size} nodes, ${result.graph.edges.length} edges — ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
  );
}

const tooManyWarnings = maxWarnings >= 0 && result.warningCount > maxWarnings;
process.exit(result.errorCount > 0 || tooManyWarnings ? 1 : 0);

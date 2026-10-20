import { parseArgs } from "node:util";
import { createKB } from "../kb.js";
import { NODE_TYPES, type NodeType } from "../types.js";
import { type CliContext, integerOption, formatOption } from "./context.js";

export async function runSearch(argv: string[], ctx: CliContext = {}): Promise<number> {
  const stdout = ctx.stdout ?? console.log;
  const stderr = ctx.stderr ?? console.error;
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        kb: { type: "string", default: "kb" },
        type: { type: "string", multiple: true, default: [] },
        limit: { type: "string", default: "10" },
        format: { type: "string", default: "text" },
        help: { type: "boolean", short: "h", default: false },
      },
    });

    const query = positionals.join(" ");
    if (values.help) {
      stdout(`Usage: simp-search <query...> [--kb dir] [--type goal|procedure|...]... [--limit N] [--format text|json]`);
      return 0;
    }
    formatOption(values.format, ["text", "json"]);
    const limit = integerOption(values.limit, "limit", 1);
    const bad = values.type!.filter((t) => !NODE_TYPES.includes(t as NodeType));
    if (bad.length) throw new Error(`unknown --type: ${bad.join(", ")}`);

    if (!query.trim()) throw new Error("Missing search query");

    const kb = await createKB(values.kb!, ctx.extensions);
    const errorCount = kb.status.errors;
    if (errorCount) {
      stderr(`KB has ${errorCount} lint error(s); run simp-lint ${values.kb} first.`);
      return 2;
    }
    const r = await kb.search(query, {
      types: values.type!.length ? (values.type as NodeType[]) : undefined,
      limit,
    });

    if (values.format === "json") stdout(JSON.stringify(r, null, 2));
    else {
      stdout("Goals:");
      for (const g of r.goals) stdout(`  ${g.relevance.toFixed(2)}  ${g.id}  — via ${g.via.map((v) => (v.id === "self" ? "self" : `${v.id} (${v.hops})`)).join(", ")}`);
      stdout("Hits:");
      for (const h of r.hits) stdout(`  ${h.relevance.toFixed(2)}  ${h.id}  [${Object.keys(h.matched).join(", ")}]`);
    }

    return 0;
  } catch (err) {
    stderr((err as Error).message);
    return 2;
  }
}

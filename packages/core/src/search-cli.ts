#!/usr/bin/env node
import { parseArgs } from "node:util";
import { lintKB } from "./index.js";
import { createSearchIndex } from "./search.js";
import { NODE_TYPES, type NodeType } from "./types.js";

const { values, positionals } = parseArgs({
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
if (values.help || !query) {
  console.log(`Usage: simp-search <query...> [--kb dir] [--type goal|procedure|...]... [--limit N] [--format text|json]`);
  process.exit(values.help ? 0 : 2);
}
const bad = values.type!.filter((t) => !NODE_TYPES.includes(t as NodeType));
if (bad.length) throw new Error(`unknown --type: ${bad.join(", ")}`);

const { graph, errorCount } = await lintKB(values.kb!);
if (errorCount) {
  console.error(`KB has ${errorCount} lint error(s); run simp-lint ${values.kb} first.`);
  process.exit(2);
}
const r = createSearchIndex(graph).search(query, {
  types: values.type!.length ? (values.type as NodeType[]) : undefined,
  limit: Number(values.limit),
});

if (values.format === "json") console.log(JSON.stringify(r, null, 2));
else {
  console.log("Goals:");
  for (const g of r.goals) console.log(`  ${g.relevance.toFixed(2)}  ${g.id}  — via ${g.via.map((v) => (v.id === "self" ? "self" : `${v.id} (${v.hops})`)).join(", ")}`);
  console.log("Hits:");
  for (const h of r.hits) console.log(`  ${h.relevance.toFixed(2)}  ${h.id}  [${Object.keys(h.matched).join(", ")}]`);
}

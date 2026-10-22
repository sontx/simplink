#!/usr/bin/env node
// Compare kb/INVENTORY.md with the node files on disk and flag unfinished drafts.
// Usage: node inventory_check.mjs [--kb kb] [--strict]   (--strict: exit 1 on any problem)
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const TYPES = {
  goals: "goal",
  procedures: "procedure",
  capabilities: "capability",
  states: "state",
  constraints: "constraint",
};
const { values } = parseArgs({
  options: {
    kb: { type: "string", default: "kb" },
    strict: { type: "boolean", default: false },
  },
});
const kb = values.kb;
const invPath = path.join(kb, "INVENTORY.md");
if (!existsSync(invPath)) {
  console.error(
    `No ${invPath}. Create it from assets/templates/INVENTORY.md (Phase 1).`,
  );
  process.exit(2);
}

// --- inventory rows: any Markdown table with "id" and "status" columns ---
const rows = new Map();
let header = null;
for (const line of readFileSync(invPath, "utf8").split("\n")) {
  if (!line.trim().startsWith("|")) {
    header = null;
    continue;
  }
  const cells = line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim().replace(/^`|`$/g, ""));
  if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
  if (!header) {
    header = cells.map((c) => c.toLowerCase());
    continue;
  }
  const get = (name) => cells[header.indexOf(name)] ?? "";
  const id = get("id");
  if (id === "simp" || /^(goal|procedure|capability|state|constraint)\./.test(id))
    rows.set(id, (get("status") || "planned").toLowerCase());
}

// --- files on disk ---
const files = new Map();
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (name.endsWith(".md")) {
      const [folder, ...rest] = path.relative(kb, full).split(path.sep);
      if (TYPES[folder] && rest.length)
        files.set(
          [TYPES[folder], ...rest].join(".").replace(/\.md$/, ""),
          full,
        );
    }
  }
};
for (const folder of Object.keys(TYPES))
  if (existsSync(path.join(kb, folder))) walk(path.join(kb, folder));

if (existsSync(path.join(kb, "simp.md"))) files.set("simp", path.join(kb, "simp.md"));

// --- compare ---
const problems = [];
const report = (title, items) => {
  if (!items.length) return;
  console.log(`\n${title} (${items.length})`);
  for (const i of items) console.log(`  ${i}`);
};
const missing = [...rows]
  .filter(([id, s]) => (s === "drafted" || s === "verified") && !files.has(id))
  .map(([id, s]) => `${id}  [${s}]`);
const notStarted = [...rows]
  .filter(([id, s]) => s === "planned" && !files.has(id))
  .map(([id]) => id);
const staleStatus = [...rows]
  .filter(([id, s]) => s === "planned" && files.has(id))
  .map(([id]) => `${id}  (file exists → mark drafted)`);
const unplanned = [...files.keys()].filter((id) => !rows.has(id));
const todo = [],
  review = [];
for (const [id, file] of files) {
  const text = readFileSync(file, "utf8");
  if (/\bTODO\b/.test(text)) todo.push(`${id}  ${file}`);
  if (/needs-review/.test(text)) review.push(id);
}

report("Marked drafted/verified but no file", missing);
report("Status still 'planned' but file exists", staleStatus);
report("Files not in the inventory", unplanned);
report("Files with TODO placeholders", todo);
report("Tagged needs-review", review);
report("Planned, not started", notStarted);
problems.push(...missing, ...unplanned, ...todo);

const counts = {};
for (const s of rows.values()) counts[s] = (counts[s] ?? 0) + 1;
console.log(
  `\nInventory: ${rows.size} rows ${JSON.stringify(counts)} · files: ${files.size} · problems: ${problems.length}`,
);
process.exit(values.strict && problems.length ? 1 : 0);

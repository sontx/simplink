#!/usr/bin/env node
// Create a kb-graph node file at the path derived from its id, from the matching template.
// Usage: node new_node.mjs <id> [--kb kb] [--title "Title"] [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const FOLDERS = {
  goal: "goals",
  procedure: "procedures",
  capability: "capabilities",
  state: "states",
  constraint: "constraints",
};
const ID =
  /^(goal|procedure|capability|state|constraint)(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    kb: { type: "string", default: "kb" },
    title: { type: "string" },
    force: { type: "boolean", default: false },
  },
});
const [id] = positionals;
if (!id || (id !== "simp" && !ID.test(id))) {
  console.error(
    `Invalid or missing id "${id ?? ""}". Expected <type>.<seg>[.<seg>…] with lowercase kebab-case segments,\n` +
      `e.g. procedure.billing.update-card. Types: ${Object.keys(FOLDERS).join(", ")}`,
  );
  process.exit(2);
}

const [type, ...segs] = id.split(".");
const file = id === "simp" ? path.join(values.kb, "simp.md") : path.join(
  values.kb,
  FOLDERS[type],
  ...segs.slice(0, -1),
  `${segs.at(-1)}.md`,
);
if (existsSync(file) && !values.force) {
  console.error(`Exists: ${file} (use --force to overwrite)`);
  process.exit(1);
}

const humanize = (s) =>
  s.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const templateDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "templates",
);
const title = values.title ?? humanize(segs.at(-1) ?? "product");
// Quote the title only when YAML needs it.
const yamlTitle = /[:#\[\]{}&*!|>'"%@`]/.test(title)
  ? JSON.stringify(title)
  : title;
// Formatters may rewrite the placeholder as "{ { title } }".
const content = readFileSync(
  path.join(templateDir, `${type}.md`),
  "utf8",
).replace(/\{\s*\{\s*title\s*\}\s*\}/, () => yamlTitle);

mkdirSync(path.dirname(file), { recursive: true });
writeFileSync(file, content);
console.log(file);

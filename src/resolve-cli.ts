#!/usr/bin/env node
import { parseArgs } from "node:util";
import { lintKB } from "./index.js";
import { resolveGoal } from "./resolve.js";
import { renderResolvedGoal } from "./render.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    kb: { type: "string", default: "kb" },
    state: { type: "string", multiple: true, default: [] },
    plan: { type: "string" },
    choice: { type: "string", multiple: true, default: [] },
    permission: { type: "string", multiple: true, default: [] },
    format: { type: "string", default: "md" },
    budget: { type: "string", default: "2000" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const goalId = positionals[0];
if (values.help || !goalId) {
  console.log(`Usage: simp-resolve <goalId> [--kb dir] [--state id=true|false]... [--choice [procId:]choiceId=key]... [--plan p] [--permission x]... [--format md|json] [--budget N]`);
  process.exit(values.help ? 0 : 2);
}

const { graph, errorCount } = await lintKB(values.kb!);
if (errorCount) {
  console.error(`KB has ${errorCount} lint error(s); run simp-lint ${values.kb} first.`);
  process.exit(2);
}

const states: Record<string, boolean> = {};
for (const s of values.state!) {
  const [id, v] = s.split("=");
  if (v !== "true" && v !== "false") throw new Error(`--state expects id=true|false, got "${s}"`);
  states[id] = v === "true";
}
const choices: Record<string, string> = {};
for (const c of values.choice!) {
  const i = c.lastIndexOf("=");
  if (i < 1) throw new Error(`--choice expects choiceId=key, got "${c}"`);
  choices[c.slice(0, i)] = c.slice(i + 1);
}
const tenant = values.plan || values.permission!.length ? { plan: values.plan, permissions: values.permission } : undefined;

const resolved = resolveGoal(graph, goalId, { states, tenant, choices });
if (values.format === "json") console.log(JSON.stringify(resolved, null, 2));
else {
  const r = renderResolvedGoal(resolved, { tokenBudget: Number(values.budget) });
  console.log(r.text);
  console.error(`\n[~${r.tokens} tokens${r.omitted.length ? `, omitted: ${r.omitted.join(", ")}` : ""}]`);
}

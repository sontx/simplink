import { parseArgs } from "node:util";
import { createKB } from "../kb.js";
import { type CliContext, integerOption, formatOption } from "./context.js";

export async function runResolve(
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
    if (values.help) {
      stdout(
        `Usage: simp-resolve <goalId> [--kb dir] [--state id=true|false]... [--choice [procId:]choiceId=key]... [--plan p] [--permission x]... [--format md|json] [--budget N]`,
      );
      return 0;
    }

    formatOption(values.format, ["md", "json"]);
    const budget = integerOption(values.budget, "budget", 1);
    if (positionals.length > 1) throw new Error("Expected one goal id");
    const states: Record<string, boolean> = {};
    for (const s of values.state!) {
      const [id, v] = s.split("=");
      if (
        !id?.trim() ||
        s.split("=").length !== 2 ||
        (v !== "true" && v !== "false")
      )
        throw new Error(`--state expects id=true|false, got "${s}"`);
      states[id] = v === "true";
    }
    const choices: Record<string, string> = {};
    for (const c of values.choice!) {
      const i = c.lastIndexOf("=");
      if (
        i < 1 ||
        !c.slice(i + 1).trim() ||
        !c
          .slice(0, i)
          .split(":")
          .every((part) => part.trim()) ||
        c.indexOf("=") !== i
      )
        throw new Error(`--choice expects choiceId=key, got "${c}"`);
      choices[c.slice(0, i)] = c.slice(i + 1);
    }
    const tenant =
      values.plan !== undefined || values.permission!.length
        ? {
            ...(values.plan !== undefined ? { plan: values.plan } : {}),
            ...(values.permission!.length
              ? { permissions: values.permission }
              : {}),
          }
        : undefined;

    if (!goalId?.trim()) throw new Error("Missing goal id");

    const kb = await createKB(values.kb!, ctx.extensions);
    const errorCount = kb.status.errors;
    if (errorCount) {
      stderr(
        `KB has ${errorCount} lint error(s); run simp-lint ${values.kb} first.`,
      );
      return 2;
    }

    const resolved = kb.resolveGoal(goalId, { states, tenant, choices });
    if (values.format === "json") stdout(JSON.stringify(resolved, null, 2));
    else {
      const r = await kb.render(resolved, { tokenBudget: budget });
      stdout(r.text);
      stderr(
        `\n[~${r.tokens} tokens${r.omitted.length ? `, omitted: ${r.omitted.join(", ")}` : ""}]`,
      );
    }

    return 0;
  } catch (err) {
    stderr((err as Error).message);
    return 2;
  }
}

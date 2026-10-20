import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { lintKB, type PlanStep } from "../src/index.js";

/** Writes files into a temp KB and lints it. */
export async function fixture(files: Record<string, string>) {
  const dir = await mkdtemp(path.join(tmpdir(), "simp-"));
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), content);
  }
  return lintKB(dir);
}

export const goal = (procs: string[]) =>
  `---\ntype: goal\ntitle: G\nsummary: g\naliases: [g]\nwhen_to_use: [g]\nprocedures: [${procs.join(", ")}]\n---\n`;

export const proc = (title: string, extra = "", steps = `1. do ${title}`) =>
  `---\ntype: procedure\ntitle: ${title}\nsummary: ${title}\n${extra}---\n## Steps\n${steps}\n`;

export const state = (title: string, satisfiedBy: string) =>
  `---\ntype: state\ntitle: ${title}\nsummary: ${title}\ncheck: look\nsatisfied_by: [${satisfiedBy}]\n---\n`;

/** Compact plan signature: "check:<state>" | "run:<proc>[?cond,cond]" */
export const sig = (plan: PlanStep[]) =>
  plan.map((s) => {
    const id = s.kind === "check" ? s.state.id : s.procedure.id;
    const when = s.when?.length
      ? `?${s.when.map((c) => c.state).join(",")}`
      : "";
    return `${s.kind}:${id}${when}`;
  });

export const choiceYaml = (id: string, options: [string, string][]) =>
  `choices:\n  - id: ${id}\n    question: Pick?\n    options:\n${options
    .map(
      ([key, p]) =>
        `      - key: ${key}\n        when: use ${key}\n        procedure: ${p}\n`,
    )
    .join("")}`;

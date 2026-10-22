import { Command, CommanderError } from "commander";
import * as p from "@clack/prompts";
import { createKB } from "../kb.js";
import { NODE_TYPES } from "../types.js";
import type { CliContext } from "./context.js";
import { runLint } from "./lint.js";
import { runSearch } from "./search.js";
import { runResolve } from "./resolve.js";
import { runDocs } from "./docs.js";
import { runIndex } from "./index-file.js";

type Runner = (argv: string[], ctx?: CliContext) => Promise<number>;

type Options = Record<string, string | string[] | boolean | undefined>;

/** Turns parsed Commander options back into runner flags; runners own validation. */
function toArgv(opts: Options): string[] {
  const argv: string[] = [];
  for (const [key, value] of Object.entries(opts)) {
    const flag = `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    if (value === true) argv.push(flag);
    else if (typeof value === "string") argv.push(`${flag}=${value}`);
    else if (Array.isArray(value))
      for (const v of value) argv.push(`${flag}=${v}`);
  }
  return argv;
}

const collect = (value: string, previous: string[]) => [...previous, value];

function cancelled<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value)) {
    p.cancel("Cancelled.");
    throw new CommanderError(130, "simp.cancelled", "");
  }
  return value as Exclude<T, symbol>;
}

/**
 * Runs the unified `simp` CLI without terminating the host process. On an
 * interactive terminal it prompts for missing arguments and shows progress;
 * with custom output callbacks or when piped it behaves like the `simp-*` bins.
 * @param argv - Command arguments excluding the Node executable and script path.
 * @param ctx - Output callbacks (default console) and KB extensions.
 * @returns Process-style exit code.
 */
export async function runSimp(
  argv: string[],
  ctx: CliContext = {},
): Promise<number> {
  const stdout = ctx.stdout ?? console.log;
  const stderr = ctx.stderr ?? console.error;
  const tty =
    !ctx.stdout && !!process.stdin.isTTY && !!process.stdout.isTTY && !p.isCI();
  let code = 0,
    started = false;
  const intro = (title: string) => {
    if (tty && !started) p.intro(title);
    started = true;
  };

  /** Runs a runner; on a terminal, behind a spinner with framed output. */
  const run = async (
    title: string,
    runner: Runner,
    args: string[],
    raw = false,
  ) => {
    if (!tty || raw) {
      code = await runner(args, ctx);
      return;
    }
    const out: string[] = [],
      err: string[] = [];
    intro("simp");
    const spin = p.spinner();
    spin.start(title);
    code = await runner(args, {
      ...ctx,
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    if (code) spin.error(title);
    else spin.stop(title);
    // ponytail: @clack/core leaves stdin raw on Windows, which swallows Ctrl+C.
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    if (out.length) p.log.message(out.join("\n").trim());
    if (err.length) (code ? p.log.error : p.log.info)(err.join("\n").trim());
    p.outro(code ? "Failed" : "Done");
  };

  const program = new Command("simp")
    .description("Lint, search, resolve, and publish Simplink knowledge bases.")
    .exitOverride()
    .configureOutput({
      writeOut: (s) => stdout(s.replace(/\n$/, "")),
      writeErr: (s) => stderr(s.replace(/\n$/, "")),
    })
    .showSuggestionAfterError();

  program
    .command("lint")
    .description("Validate a KB and report issues")
    .argument("[dir]", "KB directory", "kb")
    .option("--format <format>", "text or json", "text")
    .option("--max-warnings <n>", "fail when warnings exceed N", "-1")
    .option("--quiet", "report errors only")
    .action(async (dir: string, opts: Options) => {
      await run(
        `Linting ${dir}`,
        runLint,
        [dir, ...toArgv(opts)],
        opts.format === "json",
      );
    });

  program
    .command("search")
    .description("Search goals and nodes")
    .argument("[query...]", "search text")
    .option("--kb <dir>", "KB directory", "kb")
    .option("--type <type>", `filter: ${NODE_TYPES.join("|")}`, collect, [])
    .option("--limit <n>", "maximum hits", "10")
    .option("--format <format>", "text or json", "text")
    .action(async (words: string[], opts: Options) => {
      if (!words.length && tty) {
        intro("simp search");
        words = [
          cancelled(
            await p.text({
              message: "What are you looking for?",
              validate: (v) => (v?.trim() ? undefined : "Enter a query"),
            }),
          ),
        ];
      }
      await run(
        "Searching",
        runSearch,
        [...words, ...toArgv(opts)],
        opts.format === "json",
      );
    });

  program
    .command("resolve")
    .description("Resolve a goal into a step-by-step plan")
    .argument("[goalId]", "goal identifier")
    .option("--kb <dir>", "KB directory", "kb")
    .option("--state <id=bool>", "known state, repeatable", collect, [])
    .option(
      "--choice <[procId:]choiceId=key>",
      "choice, repeatable",
      collect,
      [],
    )
    .option("--plan <plan>", "tenant plan")
    .option("--permission <id>", "tenant permission, repeatable", collect, [])
    .option("--format <format>", "md or json", "md")
    .option("--budget <n>", "token budget", "2000")
    .action(async (goalId: string | undefined, opts: Options) => {
      if (!goalId && tty) {
        intro("simp resolve");
        // ponytail: loads the KB twice (here and in runResolve); fine for CLI-sized KBs.
        const kb = await createKB(opts.kb as string, ctx.extensions);
        const goals = [...kb.graph.nodes.values()].filter(
          (n) => n.type === "goal",
        );
        if (!goals.length) throw new Error(`No goals in ${opts.kb}`);
        goalId = cancelled(
          await p.autocomplete({
            message: "Which goal?",
            options: goals.map((g) => ({
              value: g.id,
              label: g.title,
              hint: g.id,
            })),
            placeholder: "Type to filter…",
          }),
        );
      }
      await run(
        "Resolving",
        runResolve,
        [...(goalId ? [goalId] : []), ...toArgv(opts)],
        opts.format === "json",
      );
    });

  program
    .command("docs")
    .description("Export the KB as Markdown pages")
    .option("--kb <dir>", "KB directory", "kb")
    .option("--out <dir>", "output directory")
    .option("--layout <layout>", "site or graph", "site")
    .action(async (opts: Options) => {
      if (!opts.out && tty) {
        intro("simp docs");
        opts.out = cancelled(
          await p.path({ message: "Output directory?", directory: true }),
        );
      }
      await run("Writing docs", runDocs, toArgv(opts));
    });

  program
    .command("index")
    .description("Write the static publishing index")
    .argument("[kb]", "KB directory", "kb")
    .action(async (kb: string) => {
      await run(`Indexing ${kb}`, runIndex, [kb]);
    });

  try {
    if (!argv.length && tty) {
      intro("simp");
      const command = cancelled(
        await p.select({
          message: "What do you want to do?",
          options: program.commands.map((c) => ({
            value: c.name(),
            label: c.name(),
            hint: c.description(),
          })),
        }),
      );
      argv = [command];
    }
    await program.parseAsync(argv, { from: "user" });
    return code;
  } catch (err) {
    if (err instanceof CommanderError)
      return err.exitCode === 0 || err.exitCode === 130 ? err.exitCode : 2;
    if (tty) p.cancel((err as Error).message);
    else stderr((err as Error).message);
    return 2;
  }
}

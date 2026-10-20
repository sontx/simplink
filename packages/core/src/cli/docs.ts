import { parseArgs } from "node:util";
import { lstat, mkdir, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createKB } from "../kb.js";
import type { CliContext } from "./context.js";

/** Resolve existing aliases, including the nearest existing ancestor of a new path. */
async function canonical(location: string): Promise<string> {
  try {
    return await realpath(location);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    const entry = await lstat(location).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        return undefined;
      },
    );
    if (entry?.isSymbolicLink())
      throw new Error(`Dangling output alias: ${location}`);
    const parent = path.dirname(location);
    if (parent === location) throw err;
    return path.join(await canonical(parent), path.basename(location));
  }
}

function contains(root: string, location: string): boolean {
  const relative = path.relative(root, location);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

async function existingStat(location: string) {
  try {
    return await stat(location);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return undefined;
  }
}

export async function runDocs(
  argv: string[],
  ctx: CliContext = {},
): Promise<number> {
  const stdout = ctx.stdout ?? console.log;
  const stderr = ctx.stderr ?? console.error;
  try {
    const { values } = parseArgs({
      args: argv,
      options: {
        kb: { type: "string", default: "kb" },
        out: { type: "string" },
        layout: { type: "string", default: "site" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    if (values.help) {
      stdout("Usage: simp-docs [--kb dir] --out dir [--layout site|graph]");
      return 0;
    }
    if (values.layout !== "site" && values.layout !== "graph")
      throw new Error("--layout expects site|graph");
    if (!values.out?.trim())
      throw new Error("Missing or blank --out directory");
    const input = await realpath(path.resolve(values.kb!));
    const output = await canonical(path.resolve(values.out));
    if (contains(input, output) || contains(output, input))
      throw new Error("KB and output directories must not overlap");
    const outputStat = await existingStat(output);
    if (outputStat && !outputStat.isDirectory())
      throw new Error("Output path must be a directory");
    const kb = await createKB(input, ctx.extensions);
    if (kb.status.errors) {
      stderr(
        `KB has ${kb.status.errors} lint error(s); run simp-lint ${values.kb} first.`,
      );
      return 2;
    }
    const pages = kb.docs({ layout: values.layout });
    const destinations: string[] = [];
    // Preflight every destination before the first write. Concurrent filesystem changes are outside scope.
    for (const page of pages) {
      const destination = await canonical(path.resolve(output, page.path));
      if (
        destination === output ||
        !contains(output, destination) ||
        contains(input, destination)
      )
        throw new Error(`Unsafe output destination: ${page.path}`);
      const info = await existingStat(destination);
      if (info && !info.isFile())
        throw new Error(`Output page is not a file: ${page.path}`);
      if (info && info.nlink > 1)
        throw new Error(
          `Refusing to overwrite hardlinked output page: ${page.path}`,
        );
      destinations.push(destination);
    }
    for (const [i, page] of pages.entries()) {
      await mkdir(path.dirname(destinations[i]), { recursive: true });
      await writeFile(destinations[i], page.content);
    }
    stdout(`Wrote ${pages.length} page(s) to ${values.out}.`);
    return 0;
  } catch (err) {
    stderr((err as Error).message);
    return 2;
  }
}

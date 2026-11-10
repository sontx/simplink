import { parseArgs } from "node:util";
import {
  copyFile,
  lstat,
  mkdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { createKB } from "../kb.js";
import { docAssets } from "../assets.js";
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

/**
 * Resolves a page or image destination and refuses unsafe ones before anything is written.
 * @returns The canonical destination path.
 */
async function checkDestination(
  input: string,
  output: string,
  rel: string,
  kind: "page" | "image",
): Promise<string> {
  const destination = await canonical(path.resolve(output, rel));
  if (
    destination === output ||
    !contains(output, destination) ||
    contains(input, destination)
  )
    throw new Error(`Unsafe output destination: ${rel}`);
  const info = await existingStat(destination);
  if (info && !info.isFile())
    throw new Error(`Output ${kind} is not a file: ${rel}`);
  if (info && info.nlink > 1)
    throw new Error(`Refusing to overwrite hardlinked output ${kind}: ${rel}`);
  return destination;
}

/**
 * Runs the docs CLI without terminating the host process.
 * @param argv - Command arguments excluding the Node executable and script path; use --help for supported options.
 * @param ctx - Output callbacks (default console) and KB extensions.
 * @returns Process-style exit code; failures are written to stderr.
 */
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
        lang: { type: "string" },
        help: { type: "boolean", short: "h", default: false },
      },
    });
    if (values.help) {
      stdout(
        "Usage: simp-docs [--kb dir] --out dir [--layout site|graph] [--lang code]",
      );
      return 0;
    }
    if (values.layout !== "site" && values.layout !== "graph")
      throw new Error("--layout expects site|graph");
    if (values.lang !== undefined && !values.lang.trim())
      throw new Error("--lang expects a language code, e.g. vi");
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
    const pages = kb.docs({ layout: values.layout, locale: values.lang });
    const destinations: string[] = [];
    // Preflight every destination before the first write. Concurrent filesystem changes are outside scope.
    for (const page of pages)
      destinations.push(
        await checkDestination(input, output, page.path, "page"),
      );
    const images: [string, string][] = [];
    let missing = 0;
    for (const rel of docAssets(kb.graph)) {
      const source = await canonical(path.resolve(input, rel)).catch(
        () => undefined,
      );
      // Like a dangling link, a link out of the KB is skipped as missing; lint reports both (W110).
      if (
        !source ||
        !contains(input, source) ||
        !(await existingStat(source))?.isFile()
      ) {
        missing++;
        continue;
      }
      images.push([
        source,
        await checkDestination(input, output, rel, "image"),
      ]);
    }
    for (const [i, page] of pages.entries()) {
      await mkdir(path.dirname(destinations[i]), { recursive: true });
      await writeFile(destinations[i], page.content);
    }
    for (const [source, destination] of images) {
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(source, destination);
    }
    stdout(
      `Wrote ${pages.length} page(s)${images.length ? ` and ${images.length} image(s)` : ""} to ${values.out}.`,
    );
    if (missing)
      stderr(
        `Skipped ${missing} missing image(s); run simp-lint ${values.kb} to list them.`,
      );
    return 0;
  } catch (err) {
    stderr((err as Error).message);
    return 2;
  }
}

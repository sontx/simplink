import { execFile } from "node:child_process";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fsSource, type DocSource } from "./source.js";

const exec = promisify(execFile);

export interface GitSourceOptions {
  /** Branch or tag; defaults to the repository's default branch. */
  ref?: string;
  /** Relative KB folder within the repository; defaults to its root. */
  directory?: string;
}

/** Load a fresh Git snapshot on each list call, then remove the temporary clone. */
export function gitSource(
  repo: string,
  options: GitSourceOptions = {},
): DocSource {
  const { ref, directory = "" } = options;
  return {
    name: repo,
    async list() {
      if (
        path.posix.isAbsolute(directory) ||
        path.win32.isAbsolute(directory) ||
        directory.includes("\\") ||
        directory.split("/").includes("..") ||
        /^[A-Za-z]:/.test(directory)
      )
        throw new Error(
          "Git source directory must be a relative folder within the repository",
        );
      const temporary = await mkdtemp(path.join(tmpdir(), "simp-git-"));
      const checkout = path.join(temporary, "repo");
      try {
        await exec(
          "git",
          [
            "clone",
            "--depth",
            "1",
            ...(ref === undefined ? [] : ["--branch", ref]),
            "--",
            repo,
            checkout,
          ],
          {
            env: {
              ...process.env,
              GIT_TERMINAL_PROMPT: "0",
              GCM_INTERACTIVE: "Never",
            },
            timeout: 120_000,
          },
        );
        const root = await realpath(checkout);
        const folder = await realpath(path.join(checkout, directory));
        const relative = path.relative(root, folder);
        if (
          relative === ".." ||
          relative.startsWith(`..${path.sep}`) ||
          path.isAbsolute(relative)
        )
          throw new Error(
            "Git source directory must stay within the repository",
          );
        return await fsSource(folder).list();
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    },
  };
}

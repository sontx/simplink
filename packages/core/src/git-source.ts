import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { DocSource } from "./source.js";
import { fsSource } from "./platform.js";
import { SIMP_SOURCES_FILE } from "./simp-sources.js";

const exec = promisify(execFile);

/**
 * Git revision, repository subdirectory, and optional persistent checkout settings.
 */
export interface GitSourceOptions {
  /** Branch or tag; defaults to the repository's default branch. */
  ref?: string;
  /** Relative KB folder within the repository; defaults to its root. */
  directory?: string;
  /** Keep and reuse this local clone, preserving edits. Ref applies only when cloning. */
  checkout?: string;
}

/** Creates a lazy Git document source requiring the git executable.
 * @param repo - Clone URL or local repository path.
 * @param options - Revision, relative KB directory, and optional persistent checkout.
 * @returns A source that clones on list; temporary clones are cleaned up after reading.
 * Its `read` returns the `simp-sources.yaml` captured by the latest list, so lint can check it.
 * Existing persistent checkouts are reused without fetching or resetting local edits.
 * @throws Source listing rejects for Git failures, a mismatched checkout origin, or a directory escaping the repository. */
export function gitSource(
  repo: string,
  options: GitSourceOptions = {},
): DocSource {
  const { ref, directory = "" } = options;
  // The temporary clone is gone once list returns, so keep the sidecar here.
  let sidecar: string | undefined;
  return {
    name:
      options.checkout === undefined
        ? repo
        : path.resolve(options.checkout, directory),
    async list() {
      sidecar = undefined;
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
      const temporary =
        options.checkout === undefined
          ? await mkdtemp(path.join(tmpdir(), "simp-git-"))
          : undefined;
      const checkout =
        options.checkout === undefined
          ? path.join(temporary!, "repo")
          : path.resolve(options.checkout);
      const git = (...args: string[]) =>
        exec("git", args, {
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GCM_INTERACTIVE: "Never",
          },
          timeout: 120_000,
        });
      try {
        const exists = await lstat(checkout).then(
          () => true,
          (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return false;
            throw error;
          },
        );
        if (exists) {
          const { stdout } = await git(
            "-C",
            checkout,
            "remote",
            "get-url",
            "origin",
          );
          if (stdout.trim() !== repo && stdout.trim() !== path.resolve(repo))
            throw new Error("Git checkout belongs to a different repository");
        } else {
          await mkdir(path.dirname(checkout), { recursive: true });
          await git(
            "clone",
            "--depth",
            "1",
            ...(ref === undefined ? [] : ["--branch", ref]),
            "--",
            repo,
            checkout,
          );
        }
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
        const files = fsSource(folder);
        const listed = await files.list();
        sidecar = await files.read?.(SIMP_SOURCES_FILE);
        return listed;
      } finally {
        if (temporary !== undefined)
          await rm(temporary, { recursive: true, force: true });
      }
    },
    read: (relPath) => (relPath === SIMP_SOURCES_FILE ? sidecar : undefined),
  };
}

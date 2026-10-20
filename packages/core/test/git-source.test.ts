import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import * as core from "../src/index.js";
import { proc } from "./helpers.js";

const exec = promisify(execFile);

test("Git sources load branches, tags, subfolders, and fresh committed snapshots", async (t) => {
  assert.equal(typeof core.gitSource, "function");
  const repo = await mkdtemp(path.join(tmpdir(), "simp-git-test-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => exec("git", ["-C", repo, ...args]);
  const commit = async () => {
    await git("add", ".");
    await git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-m",
      "fixture",
    );
  };
  await git("init", "--initial-branch=main");
  await mkdir(path.join(repo, "kb/procedures"), { recursive: true });
  const file = path.join(repo, "kb/procedures/a.md");
  await writeFile(file, proc("First"));
  await commit();
  await git("tag", "v1");
  const source = core.gitSource(repo, { directory: "kb" });
  assert.equal(
    (await core.createKB(source)).node("procedure.a")?.title,
    "First",
  );
  await writeFile(file, proc("Second"));
  await commit();
  assert.equal(
    (await core.createKB(source)).node("procedure.a")?.title,
    "Second",
  );
  const tagged = await core.createKB(
    core.gitSource(repo, { ref: "v1", directory: "kb" }),
  );
  assert.equal(tagged.node("procedure.a")?.title, "First");
  const branch = await core.createKB(
    core.gitSource(repo, { ref: "main", directory: "kb" }),
  );
  assert.equal(branch.node("procedure.a")?.title, "Second");
  await assert.rejects(core.gitSource(repo, { ref: "missing" }).list());
  await assert.rejects(core.gitSource(repo, { directory: "missing" }).list());
});

test("Git sources reject directories outside the repository", async () => {
  for (const directory of [
    "..",
    "../outside",
    "/outside",
    "C:\\outside",
    "kb\\..\\..",
  ])
    await assert.rejects(
      async () => core.gitSource("unused", { directory }).list(),
      /directory/i,
    );
});

test("Git sources propagate clone failures", async () => {
  await assert.rejects(
    core.gitSource(path.join(tmpdir(), "simp-missing-repository.git")).list(),
  );
});

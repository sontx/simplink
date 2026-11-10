import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

  const checkout = path.join(repo, "checkout");
  const persistent = core.gitSource(repo, { checkout, directory: "kb" });
  await core.createKB(persistent);
  const edited = path.join(checkout, "kb/procedures/a.md");
  await writeFile(edited, proc("Local edit"));
  const reopened = await core.createKB(
    core.gitSource(repo, { checkout, directory: "kb" }),
  );
  assert.equal(reopened.node("procedure.a")?.title, "Local edit");
  assert.equal(await readFile(file, "utf8"), proc("Second"));
  assert.equal(
    (
      await exec("git", ["-C", checkout, "status", "--porcelain"])
    ).stdout.trim(),
    "M kb/procedures/a.md",
  );
  await assert.rejects(
    core.gitSource(repo + "-other", { checkout }).list(),
    /repository/i,
  );
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

test("Git sources let lint check simp-sources.yaml after the clone is removed", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "simp-git-test-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => exec("git", ["-C", repo, ...args]);
  await git("init", "--initial-branch=main");
  await mkdir(path.join(repo, "procedures"), { recursive: true });
  await writeFile(path.join(repo, "procedures/a.md"), proc("A"));
  await writeFile(
    path.join(repo, core.SIMP_SOURCES_FILE),
    "procedure.gone: [src/gone.ts]\n",
  );
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
  const r = await core.lintKB(core.gitSource(repo));
  assert.deepEqual(
    r.issues.filter((i) => i.code === "W113").map((i) => i.line),
    [1],
  );
});

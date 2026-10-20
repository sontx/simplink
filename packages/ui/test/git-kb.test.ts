import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { createUiHandler } from "../src/server.js";

const exec = promisify(execFile);

test("UI edits a persistent Git clone and preserves edits across reload and restart", async (t) => {
  const repo = await mkdtemp(path.join(tmpdir(), "simplink-ui-git-"));
  const url = pathToFileURL(repo).href;
  const checkout = path.join(
    homedir(),
    ".simplink",
    "repos",
    createHash("sha256").update(url).digest("hex"),
  );
  t.after(async () => {
    await rm(repo, { recursive: true, force: true });
    await rm(checkout, { recursive: true, force: true });
  });
  await cp(
    fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
    repo,
    { recursive: true },
  );
  const git = (...args: string[]) => exec("git", ["-C", repo, ...args]);
  await git("init", "--initial-branch=main");
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
  const start = async () => {
    const server = createServer(createUiHandler(url));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    );
    const address = server.address();
    assert(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  };
  const base = await start();
  const response = await fetch(base + "/api/kb");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status.root, checkout);
  const rel = "procedures/zalo/send-message.md";
  const original = await readFile(path.join(repo, rel), "utf8");
  const edited = original + "\nLocal Git edit\n";
  const mutate = (endpoint: string, body: unknown) =>
    fetch(base + endpoint, {
      method: endpoint === "/api/files" ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await mutate("/api/files", { path: rel, content: edited })).status,
    200,
  );
  assert.equal((await mutate("/api/reload", {})).status, 200);
  assert.equal(await readFile(path.join(checkout, rel), "utf8"), edited);
  assert.equal(await readFile(path.join(repo, rel), "utf8"), original);
  const restarted = await start();
  const node = await fetch(
    restarted + "/api/nodes/procedure.zalo.send-message",
  );
  assert.equal(node.status, 200);
  assert.equal((await node.json()).raw, edited);
  assert.match(
    (await exec("git", ["-C", checkout, "status", "--porcelain"])).stdout,
    /M procedures\/zalo\/send-message.md/,
  );
});

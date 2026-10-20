import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createUiHandler } from "../src/server.js";

test("UI API reads, edits and resolves a KB while protecting disk writes", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "simplink-ui-"));
  await cp(
    fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
    root,
    { recursive: true },
  );
  const server = createServer(createUiHandler(root));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const mutate = (url: string, method: string, body: unknown) =>
    fetch(base + url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const kb = await (await fetch(base + "/api/kb")).json();
  assert.equal(kb.status.errors, 0);
  assert(
    kb.nodes.some(
      (node: { id: string }) => node.id === "goal.send-zalo-message",
    ),
  );
  const docs = await (await fetch(base + "/api/docs?layout=site")).json();
  assert(docs.includes("guides/messaging/send-a-message.md"));
  const page = await (
    await fetch(
      base +
        "/api/docs/page?layout=site&path=guides/messaging/send-a-message.md",
    )
  ).json();
  assert(page.content.includes("# "));
  const schema = await (await fetch(base + "/api/schema")).json();
  assert.equal(schema.procedure.uses, "capability");
  assert.equal(schema.goal.procedures, "procedure");
  assert.equal(schema.procedure.related, "node");
  const plan = await (
    await fetch(base + "/api/resolve/goal.send-zalo-message")
  ).json();
  assert(plan.resolved);
  assert(plan.rendered);
  assert.equal(
    (await fetch(base + "/api/resolve/state.channel.zalo-connected")).status,
    400,
  );
  const rel = "procedures/zalo/send-message.md";
  const original = await readFile(path.join(root, rel), "utf8");
  const broken = await mutate("/api/files", "PUT", {
    path: rel,
    content: "---\ntype: [\n---\nBroken\n",
  });
  assert(
    (await broken.json()).issues.some(
      (issue: { severity: string }) => issue.severity === "error",
    ),
  );
  assert.equal(
    await readFile(path.join(root, rel), "utf8"),
    "---\ntype: [\n---\nBroken\n",
  );
  const invalidNode = await (
    await fetch(base + "/api/nodes/procedure.zalo.send-message")
  ).json();
  assert.equal(invalidNode.node.path, rel);
  assert.equal(invalidNode.raw, "---\ntype: [\n---\nBroken\n");
  assert.equal(
    (
      await (
        await mutate("/api/files", "PUT", { path: rel, content: original })
      ).json()
    ).status.errors,
    0,
  );
  for (const invalid of [
    "../escape.md",
    "goals/x.txt",
    "goals/../escape.md",
    "goals\\escape.md",
  ]) {
    assert.equal(
      (await mutate("/api/files", "PUT", { path: invalid, content: "x" }))
        .status,
      400,
    );
  }
  const decorated = original
    .replace("---\n", "---\n# preserved comment\n")
    .replace(/\n---\n/, "\n---\r\n");
  await mutate("/api/files", "PUT", { path: rel, content: decorated });
  const patched = await mutate(
    "/api/nodes/procedure.zalo.send-message/edges",
    "PATCH",
    { kind: "uses", targets: ["capability.broadcast.schedule"] },
  );
  assert.equal(patched.status, 200);
  const changed = await readFile(path.join(root, rel), "utf8");
  assert(changed.includes("# preserved comment"));
  assert.equal(
    changed.slice(changed.indexOf("\n---") + 4),
    decorated.slice(decorated.indexOf("\n---") + 4),
  );
  const flowSource = decorated.replace(
    "# preserved comment",
    "# preserved comment\nuses: [capability.broadcast.schedule] # edge comment",
  );
  await mutate("/api/files", "PUT", { path: rel, content: flowSource });
  assert.equal(
    (
      await mutate("/api/nodes/procedure.zalo.send-message/edges", "PATCH", {
        kind: "uses",
        targets: [],
      })
    ).status,
    200,
  );
  assert.equal(
    await readFile(path.join(root, rel), "utf8"),
    flowSource.replace(
      "[capability.broadcast.schedule] # edge comment",
      "[] # edge comment",
    ),
  );
  for (const newline of ["\n", "\r\n"]) {
    for (const followingKey of ["", "title: Preserved title\n"]) {
      const blockSource =
        `---\ntype: procedure\nsummary: Preserved summary\nuses:\n  - capability.broadcast.schedule\n${followingKey}---\n\nBody remains unchanged.\n`.replace(
          /\n/g,
          newline,
        );
      await mutate("/api/files", "PUT", { path: rel, content: blockSource });
      assert.equal(
        (
          await mutate(
            "/api/nodes/procedure.zalo.send-message/edges",
            "PATCH",
            {
              kind: "uses",
              targets: [],
            },
          )
        ).status,
        200,
      );
      assert.equal(
        await readFile(path.join(root, rel), "utf8"),
        blockSource.replace(
          `- capability.broadcast.schedule${newline}`,
          `[]${newline}`,
        ),
      );
    }
  }
  await mutate("/api/files", "PUT", { path: rel, content: decorated });
  assert.equal(
    (
      await mutate("/api/nodes/procedure.zalo.send-message/edges", "PATCH", {
        kind: "procedures",
        targets: [],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate("/api/nodes/procedure.zalo.send-message/edges", "PATCH", {
        kind: "related",
        targets: ["goal.send-zalo-message"],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await mutate("/api/nodes/procedure.zalo.send-message/edges", "PATCH", {
        kind: "related",
        targets: ["goal.send-zalo-message", "goal.send-zalo-message"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutate("/api/nodes/procedure.zalo.send-message/edges", "PATCH", {
        kind: "uses",
        targets: ["goal.send-zalo-message"],
      })
    ).status,
    400,
  );
  assert.equal(
    (await fetch(base + "/api/reload", { method: "POST" })).status,
    415,
  );
  assert.equal(
    (await mutate("/api/files", "POST", { path: rel, content: original }))
      .status,
    409,
  );
  assert.equal(
    (
      await mutate("/api/files", "PUT", {
        path: "goals/large.md",
        content: "x".repeat(1024 * 1024),
      })
    ).status,
    413,
  );
  const foreignStatus = await new Promise<number>((resolve, reject) => {
    const req = request(
      base + "/api/reload",
      {
        method: "POST",
        headers: { host: "evil.example", "content-type": "application/json" },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.on("error", reject);
    req.end("{}");
  });
  assert.equal(foreignStatus, 403);
  const foreignReadStatus = await new Promise<number>((resolve, reject) => {
    const req = request(
      base + "/api/kb",
      { headers: { host: "evil.example" } },
      (res) => {
        res.resume();
        resolve(res.statusCode!);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(foreignReadStatus, 403);
  const outside = await mkdtemp(path.join(tmpdir(), "simplink-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await symlink(
    outside,
    path.join(root, "goals", "outside"),
    process.platform === "win32" ? "junction" : "dir",
  );
  assert.equal(
    (
      await mutate("/api/files", "POST", {
        path: "goals/outside/escape.md",
        content: "x",
      })
    ).status,
    400,
  );
  const outsideFile = path.join(outside, "protected.md");
  await writeFile(outsideFile, "keep");
  try {
    await symlink(outsideFile, path.join(root, "goals", "linked.md"), "file");
    await symlink(
      path.join(outside, "missing.md"),
      path.join(root, "goals", "dangling.md"),
      "file",
    );
    for (const linked of ["goals/linked.md", "goals/dangling.md"]) {
      assert.equal(
        (
          await mutate("/api/files", "PUT", {
            path: linked,
            content: "overwrite",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(base + "/api/files?path=" + linked, {
            method: "DELETE",
            headers: { "content-type": "application/json" },
          })
        ).status,
        400,
      );
    }
    assert.equal(await readFile(outsideFile, "utf8"), "keep");
  } catch (error) {
    if (
      process.platform !== "win32" ||
      (error as NodeJS.ErrnoException).code !== "EPERM"
    )
      throw error;
    t.diagnostic(
      "File symlink check requires Windows Developer Mode; directory junction containment was checked",
    );
  }
  await mutate("/api/files", "POST", {
    path: "goals/new/nested.md",
    content: "---\ntitle: New\nsummary: New goal\n---\n",
  });
  assert.equal(
    (
      await fetch(base + "/api/files?path=goals/new/nested.md", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      })
    ).status,
    200,
  );
  assert.equal((await fetch(base + "/api/nodes/missing")).status, 404);
  assert.equal((await fetch(base + "/api/docs?layout=invalid")).status, 400);
  assert.equal((await fetch(base + "/..%2f..%2fpackage.json")).status, 400);
  assert.equal((await fetch(base + "/api/search?q=zalo")).status, 200);
  assert.equal(
    (
      await fetch(base + "/api/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      })
    ).status,
    400,
  );
});

test("UI docs API explains docs export failures instead of returning 500", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "simplink-ui-docs-"));
  await cp(
    fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
    root,
    { recursive: true },
  );
  for (const name of ["first", "second"])
    await writeFile(
      path.join(root, "constraints", `${name}.md`),
      `---\ntype: constraint\ntitle: ${name}\nsummary: ${name}\nseverity: warning\ndocs:\n  path: reference/shared.md\n---\n`,
    );
  const server = createServer(createUiHandler(root));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await rm(root, { recursive: true, force: true });
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/docs?layout=site`,
  );
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), {
    error: "Duplicate docs path: reference/shared.md",
  });
  const graph = await fetch(
    `http://127.0.0.1:${address.port}/api/docs?layout=graph`,
  );
  assert.equal(graph.status, 200);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createKB, exportDocs, memorySource, runDocs } from "../src/index.js";
import { goal, proc, state, choiceYaml } from "./helpers.js";

test("site export groups tasks, reference and checks with linked directory indexes without changing the graph", async () => {
  const kb = await createKB(
    memorySource({
      "goals/messaging/send.md": goal(["procedure.messaging.send"]),
      "procedures/messaging/send.md": proc("Send"),
      "states/ready.md": state("Ready", "procedure.messaging.send"),
      "constraints/consent.md":
        "---\ntype: constraint\ntitle: Consent\nsummary: Obtain consent\nseverity: blocking\n---",
      "capabilities/schedule.md":
        "---\ntype: capability\ntitle: Schedule\nsummary: Schedule delivery\n---",
    }),
  );
  const before = JSON.stringify([...kb.graph.nodes]);
  const pages = kb.docs();
  for (const route of [
    "index.md",
    "guides/index.md",
    "guides/messaging/index.md",
    "guides/messaging/send.md",
    "guides/messaging/how-to/send.md",
    "reference/consent.md",
    "troubleshooting/ready.md",
  ])
    assert.ok(
      pages.some((p) => p.path === route),
      route,
    );
  const guide = pages.find(
    (p) => p.path === "guides/messaging/send.md",
  )!.content;
  assert.match(guide, /\]\(how-to\/send.md\)/);
  assert.ok(!guide.includes("**RUN**"));
  assert.ok(!guide.includes("## Procedures"));
  const home = pages.find((p) => p.path === "index.md")!.content;
  assert.match(home, /\[Guides\]\(guides\/index.md\)/);
  assert.equal(JSON.stringify([...kb.graph.nodes]), before);
  const paths = new Set(pages.map((p) => p.path));
  for (const page of pages)
    for (const m of page.content.matchAll(/\]\(([^)#]+\.md)(?:#[^)]*)?\)/g))
      assert.ok(
        paths.has(
          path.posix.normalize(
            path.posix.join(path.posix.dirname(page.path), m[1]),
          ),
        ),
        `${page.path}: ${m[1]}`,
      );
});

test("docs metadata controls paths and navigation order; links retain explicit labels, fragments and literal code", async () => {
  const kb = await createKB(
    memorySource({
      "procedures/a.md": proc(
        "A",
        "docs:\n  path: getting-started/connect.md\n  order: 2\n",
        "1. [[procedure.b#setup|Configure]]\n2. `[[procedure.b]]`\n\n````md\n```\n[[procedure.b]]\n```\n````",
      ),
      "procedures/b.md": proc(
        "B",
        "docs:\n  path: getting-started/prepare.md\n  order: 1\n",
      ),
    }),
  );
  assert.equal(kb.status.errors, 0, JSON.stringify(kb.issues));
  const pages = exportDocs(kb.graph);
  const page = pages.find(
    (p) => p.path === "getting-started/connect.md",
  )!.content;
  assert.ok(page.includes("[Configure](prepare.md#setup)"));
  assert.ok(page.includes("`[[procedure.b]]`"));
  assert.ok(page.includes("````md\n```\n[[procedure.b]]\n```\n````"));
  const index = pages.find(
    (p) => p.path === "getting-started/index.md",
  )!.content;
  assert.ok(index.indexOf("[B]") < index.indexOf("[A]"));
  assert.equal(kb.docs({ layout: "graph" })[0].path, "procedures/a.md");
});

test("site walkthroughs retain choices, conditional fixes, availability, constraints and branch warnings", async () => {
  const kb = await createKB(
    memorySource({
      "goals/g.md": goal(["procedure.a"]),
      "procedures/a.md": proc(
        "A",
        "preconditions: [state.ready]\n" +
          choiceYaml("recipient", [["phone", "procedure.b"]]),
        "1. choice:recipient\n2. Keep `procedure.a` literal",
      ),
      "procedures/b.md": proc(
        "B",
        "availability:\n  plans: [enterprise]\nconstrained_by: [constraint.c]\nrequires: [procedure.dep]\n",
      ),
      "procedures/dep.md": proc("Dep"),
      "procedures/fix.md": proc(
        "Fix",
        "",
        "1. Fix\n\n## Failure handling\nRetry carefully.",
      ),
      "states/ready.md": state("Ready", "procedure.fix"),
      "constraints/c.md":
        "---\ntype: constraint\ntitle: C\nsummary: Obtain consent\nseverity: blocking\n---",
    }),
  );
  const page = kb
    .docs({ maxDepth: 1, tenant: { plan: "free" } })
    .find((p) => p.path === "guides/g.md")!.content;
  for (const text of [
    "## Steps",
    "Pick?",
    "use phone",
    "requires plan: enterprise",
    "blocking",
    "Obtain consent",
    "max depth reached",
    "Retry carefully.",
    "If",
    "Keep `procedure.a` literal",
  ])
    assert.ok(page.includes(text), text);
  assert.ok(!page.includes("**RUN**"));
  assert.ok(!page.includes("**CHECK**"));
  const procedure = kb
    .docs()
    .find((p) => p.path === "guides/how-to/a.md")!.content;
  assert.ok(!procedure.includes("choice:recipient"));
  assert.match(procedure, /Pick\?/);
  assert.match(procedure, /use phone/);
});

test("site export validates metadata and rejects duplicate or reserved routes", async () => {
  for (const extra of [
    "docs: {path: ../escape.md}",
    "docs: {path: /escape.md}",
    "docs: {path: guides/index.md}",
    "docs: {order: -1}",
    "docs: {unknown: true}",
  ]) {
    const kb = await createKB(
      memorySource({ "procedures/a.md": proc("A", extra + "\n") }),
    );
    assert.ok(kb.status.errors > 0, extra);
  }
  const kb = await createKB(
    memorySource({
      "procedures/a.md": proc("A", "docs: {path: guides/task.md}\n"),
      "procedures/b.md": proc("B", "docs: {path: guides/task.md}\n"),
    }),
  );
  assert.throws(() => exportDocs(kb.graph), /Duplicate.*guides\/task.md/);
  // Defensive validation also protects direct callers that changed a graph after linting.
  kb.graph.nodes.get("procedure.a")!.data.docs = { path: "../escape.md" };
  assert.throws(() => exportDocs(kb.graph), /Invalid.*path/);
});

test("site recommendations pass original KB paths to availability policies", async () => {
  const seen: string[] = [];
  const kb = await createKB(
    memorySource({
      "goals/g.md": goal(["procedure.a"]),
      "procedures/a.md": proc(
        "A",
        "docs: {path: getting-started/connect.md}\n",
      ),
    }),
    {
      resolve: {
        availability: (node) => {
          seen.push(node.path);
          return node.path.startsWith("procedures/")
            ? ["Source policy denied"]
            : [];
        },
      },
    },
  );
  const page = kb.docs().find((p) => p.path === "guides/g.md")!.content;
  assert.match(page, /Source policy denied/);
  assert.ok(seen.includes("procedures/a.md"));
  assert.ok(!seen.includes("getting-started/connect.md"));
});

test("site CLI defaults to site layout, captures invalid layout, and retains graph mode", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-site-"));
  try {
    const kb = path.join(root, "kb");
    await mkdir(path.join(kb, "procedures"), { recursive: true });
    await writeFile(
      path.join(kb, "procedures/a.md"),
      proc("A", "docs: {path: getting-started/connect.md}\n"),
    );
    const errors: string[] = [];
    const ctx = { stdout: () => {}, stderr: (s: string) => errors.push(s) };
    assert.equal(
      await runDocs(["--kb", kb, "--out", path.join(root, "site")], ctx),
      0,
    );
    assert.match(
      await readFile(path.join(root, "site/index.md"), "utf8"),
      /Getting started/,
    );
    assert.equal(
      await runDocs(
        ["--kb", kb, "--out", path.join(root, "graph"), "--layout", "graph"],
        ctx,
      ),
      0,
    );
    assert.match(
      await readFile(path.join(root, "graph/procedures/a.md"), "utf8"),
      /# A/,
    );
    assert.equal(
      await runDocs(["--layout", "bad", "--out", path.join(root, "bad")], ctx),
      2,
    );
    await assert.rejects(readdir(path.join(root, "bad")), { code: "ENOENT" });
    assert.match(errors.join(""), /layout/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("site CLI preflights generated indexes and custom paths before writing any page", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-site-"));
  try {
    const kb = path.join(root, "kb"),
      out = path.join(root, "site");
    await mkdir(path.join(kb, "procedures"), { recursive: true });
    await mkdir(out);
    const source = path.join(kb, "procedures/a.md"),
      bytes = proc("A", "docs: {path: getting-started/connect.md}\n");
    await writeFile(source, bytes);
    try {
      await symlink(
        kb,
        path.join(out, "getting-started"),
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (err) {
      if (
        ["EPERM", "EACCES"].includes((err as NodeJS.ErrnoException).code ?? "")
      ) {
        t.skip("Platform disallows directory symlinks");
        return;
      }
      throw err;
    }
    assert.equal(
      await runDocs(["--kb", kb, "--out", out], { stderr: () => {} }),
      2,
    );
    await assert.rejects(readFile(path.join(out, "index.md")), {
      code: "ENOENT",
    });
    assert.equal(await readFile(source, "utf8"), bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

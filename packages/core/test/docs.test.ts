import { test } from "node:test";
import assert from "node:assert/strict";
import matter from "gray-matter";
import { fileURLToPath } from "node:url";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  link,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createKB,
  memorySource,
  type KBGraph,
  type ResolveOptions,
  type CliContext,
} from "../src/index.js";
import { exportDocs as exportWithLayout } from "../src/docs.js";
import { runDocs as runWithLayout } from "../src/cli/docs.js";
import { choiceYaml, goal, proc, state } from "./helpers.js";

const exportDocs = (graph: KBGraph, opts: ResolveOptions = {}) =>
  exportWithLayout(graph, { ...opts, layout: "graph" });
const runDocs = (argv: string[], ctx: CliContext = {}) =>
  runWithLayout(["--layout", "graph", ...argv], ctx);

const fixtureRoot = fileURLToPath(
  new URL("../../../test/fixtures/kb", import.meta.url),
);

test("goal docs expose depth warnings from unselected choice branches", async () => {
  const kb = await createKB(
    memorySource({
      "goals/g.md": goal(["procedure.a"]),
      "procedures/a.md": proc(
        "A",
        choiceYaml("pick", [["b", "procedure.b"]]),
        "1. choice:pick",
      ),
      "procedures/b.md": proc("B"),
    }),
  );
  const page = kb
    .docs({ layout: "graph", maxDepth: 0 })
    .find((p) => p.path === "goals/g.md")!.content;
  assert.match(page, /## Warnings/);
  assert.match(page, /max depth reached at procedure.b/);
});

test("docs CLI refuses hardlinked destinations that would overwrite source bytes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-docs-"));
  try {
    const kb = path.join(root, "kb"),
      out = path.join(root, "out");
    await mkdir(path.join(kb, "procedures"), { recursive: true });
    await mkdir(path.join(out, "procedures"), { recursive: true });
    const source = path.join(kb, "procedures/a.md"),
      bytes = proc("A");
    await writeFile(source, bytes);
    await link(source, path.join(out, "procedures/a.md"));
    await mkdir(path.join(kb, "goals"));
    await writeFile(path.join(kb, "goals/g.md"), goal(["procedure.a"]));
    assert.equal(
      await runDocs(["--kb", kb, "--out", out], {
        stdout: () => {},
        stderr: () => {},
      }),
      2,
    );
    assert.equal(await readFile(source, "utf8"), bytes);
    await assert.rejects(readdir(path.join(out, "goals")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("docs CLI rejects dangling page symlinks into the KB before writes", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-docs-"));
  try {
    const kb = path.join(root, "kb"),
      out = path.join(root, "out");
    await mkdir(path.join(kb, "procedures"), { recursive: true });
    await mkdir(path.join(out, "procedures"), { recursive: true });
    await writeFile(path.join(kb, "procedures/a.md"), proc("A"));
    const target = path.join(kb, "procedures/new.md");
    try {
      await symlink(target, path.join(out, "procedures/a.md"), "file");
    } catch (err) {
      if (
        ["EPERM", "EACCES"].includes((err as NodeJS.ErrnoException).code ?? "")
      ) {
        t.skip("Platform disallows file symlinks");
        return;
      }
      throw err;
    }
    assert.equal(
      await runDocs(["--kb", kb, "--out", out], {
        stdout: () => {},
        stderr: () => {},
      }),
      2,
    );
    await assert.rejects(readFile(target), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("docs CLI preflights dangling directory aliases before writing earlier pages", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-docs-"));
  try {
    const kb = path.join(root, "kb"),
      out = path.join(root, "out");
    await mkdir(path.join(kb, "procedures"), { recursive: true });
    await mkdir(path.join(kb, "goals"));
    await mkdir(out);
    await writeFile(path.join(kb, "procedures/a.md"), proc("A"));
    await writeFile(path.join(kb, "goals/g.md"), goal(["procedure.a"]));
    try {
      await symlink(
        path.join(kb, "missing"),
        path.join(out, "procedures"),
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
      await runDocs(["--kb", kb, "--out", out], {
        stdout: () => {},
        stderr: () => {},
      }),
      2,
    );
    await assert.rejects(readdir(path.join(out, "goals")), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exports every node with minimal round-trippable frontmatter and original paths", async () => {
  const title = 'A "title"\nsecond line';
  const summary = 'A "summary"\nnext line';
  const kb = await createKB(
    memorySource({
      "procedures/a.md": `---\ntype: procedure\ntitle: ${JSON.stringify(title)}\nsummary: ${JSON.stringify(summary)}\n---\nBody`,
      "states/ready.md": state("Ready", "procedure.a"),
    }),
  );
  const pages = exportDocs(kb.graph);
  assert.deepEqual(
    pages.map((p) => p.path),
    [...kb.graph.nodes.values()].map((n) => n.path),
  );
  const page = pages.find((p) => p.path === "procedures/a.md")!;
  assert.deepEqual(matter(page.content).data, { title, description: summary });
  assert.match(page.content, /## Referenced by/);
  assert.match(page.content, /\[Ready\]\(\.\.\/states\/ready.md\)/);
});

test("converts prose wikilinks while preserving fences and matching inline code spans byte for byte", async () => {
  const code = [
    "```ts\n[[procedure.b]]\n```",
    "~~~\n[[procedure.b]]\n~~~",
    "````md\n```\n[[procedure.b]]\n```\n````",
    "   ```\n[[procedure.b]]\n   ```",
    "`[[procedure.b]]` and ``literal ` [[procedure.b]]``",
    "```\n[[procedure.b]]",
  ];
  const body =
    "[[procedure.b]] [[procedure.b|Custom]] [[procedure.b#heading]] [[procedure.a]] [[missing]]\n\n" +
    code.join("\n\n");
  const kb = await createKB(
    memorySource({
      "procedures/a.md": proc("A", "", body),
      "procedures/nested/b.md": proc("B [label]"),
    }),
  );
  // IDs follow the folder hierarchy.
  const a = kb.graph.nodes.get("procedure.a")!;
  a.body = a.body.replaceAll("procedure.b", "procedure.nested.b");
  const page = exportDocs(kb.graph).find((p) => p.path === a.path)!.content;
  assert.ok(page.includes("[B \\[label\\]](nested/b.md)"));
  assert.ok(page.includes("[Custom](nested/b.md)"));
  assert.ok(page.includes("(nested/b.md#heading)"));
  assert.ok(page.includes("[A](a.md)"));
  assert.ok(page.includes("`missing`"));
  for (const block of code)
    assert.ok(
      page.includes(block.replaceAll("procedure.b", "procedure.nested.b")),
      block,
    );
});

test("procedure pages retain choice markers and explain every branch", async () => {
  const kb = await createKB(fixtureRoot);
  const page = exportDocs(kb.graph).find(
    (p) => p.path === "procedures/zalo/send-message.md",
  )!.content;
  for (const text of [
    "choice:recipient",
    "## Choices",
    "How is the recipient identified?",
    "uid",
    "A user identifier is known",
    "phone",
    "A phone number is known",
    "(deliver-by-uid.md)",
    "(deliver-by-phone.md)",
    "## Choice options",
  ])
    assert.ok(page.includes(text), text);
});

test("goal pages contain linked recommendations, checks, branches and literal authored code", async () => {
  const kb = await createKB(fixtureRoot);
  const procedure = kb.graph.nodes.get("procedure.zalo.send-message")!;
  procedure.body +=
    "\n3. See [[state.channel.zalo-connected]] and `procedure.zalo.send-message`.\n";
  const page = exportDocs(kb.graph).find(
    (p) => p.path === "goals/send-zalo-message.md",
  )!.content;
  for (const text of [
    "## Recommended plan",
    "**RUN**",
    "**CHECK**",
    "**CHOOSE**",
    "How is the recipient identified?",
    "../procedures/zalo/send-message.md",
    "../states/channel/zalo-connected.md",
    "`procedure.zalo.send-message`",
  ])
    assert.ok(page.includes(text), text);
});

test("recommendations retain restrictions, inherited constraints, warnings, failures and deprecation", async () => {
  const kb = await createKB(
    memorySource({
      "goals/g.md": goal(["procedure.a", "procedure.b"]),
      "procedures/a.md": proc(
        "A",
        "requires: [procedure.dep]\nuses: [capability.c]\n",
        "1. A\n\n## Failure handling\nTry again.",
      ),
      "procedures/b.md": proc("B", "availability:\n  plans: [paid]\n"),
      "procedures/dep.md": proc("Old", "status: deprecated\n"),
      "capabilities/c.md":
        "---\ntype: capability\ntitle: C\nsummary: C\nconstrained_by: [constraint.block]\n---",
      "constraints/block.md":
        "---\ntype: constraint\ntitle: Block\nsummary: Must obtain consent\nseverity: blocking\n---",
    }),
  );
  const page = exportDocs(kb.graph, { tenant: { plan: "free" } }).find(
    (p) => p.path === "goals/g.md",
  )!.content;
  for (const text of [
    "unavailable",
    "requires plan: paid",
    "blocking",
    "Must obtain consent",
    "Deprecated",
    "Try again.",
  ])
    assert.ok(page.includes(text), text);
  const limited = exportDocs(kb.graph, { maxDepth: 0 }).find(
    (p) => p.path === "goals/g.md",
  )!.content;
  assert.match(limited, /max depth reached/);
  assert.match(limited, /## Warnings/);
});

test("KB.docs merges resolve extension defaults and per-call overrides", async () => {
  const seen: unknown[] = [];
  const kb = await createKB(
    memorySource({
      "goals/g.md": goal(["procedure.a", "procedure.b"]),
      "procedures/a.md": proc("A", "requires: [procedure.dep]\n"),
      "procedures/b.md": proc("B", "requires: [procedure.dep]\n"),
      "procedures/dep.md": proc("Dependency"),
    }),
    {
      resolve: {
        tenant: { plan: "paid", permissions: ["send"] },
        maxDepth: 0,
        availability: (_, tenant) => {
          seen.push(tenant);
          return ["Policy denied"];
        },
        rank: (a, b) => b.order - a.order,
      },
    },
  );
  const defaults = kb.docs({ layout: "graph" })[0].content;
  assert.match(defaults, /Recommended plan\n\n\[B\]/);
  assert.match(defaults, /Policy denied/);
  assert.match(defaults, /max depth reached/);
  assert.ok(
    seen.some(
      (v) =>
        JSON.stringify(v) ===
        JSON.stringify({ plan: "paid", permissions: ["send"] }),
    ),
  );
  const override = kb.docs({
    layout: "graph",
    tenant: { plan: "free" },
    maxDepth: 8,
    availability: (_, tenant) => {
      assert.deepEqual(tenant, { plan: "free", permissions: ["send"] });
      return [];
    },
    rank: (a, b) => a.order - b.order,
  })[0].content;
  assert.match(override, /Recommended plan\n\n\[A\]/);
  assert.ok(!override.includes("Policy denied"));
  assert.ok(!override.includes("max depth reached"));
});

test("goals with no alternatives remain readable", async () => {
  const kb = await createKB(memorySource({ "goals/g.md": goal([]) }));
  assert.match(
    exportDocs(kb.graph)[0].content,
    /No resolvable procedure for this goal/,
  );
});

test("docs CLI validates arguments and help without changing process.exitCode", async () => {
  const before = process.exitCode;
  for (const args of [
    [],
    ["--out", " "],
    ["--nope"],
    ["extra", "--out", "docs"],
  ]) {
    const errors: string[] = [];
    assert.equal(await runDocs(args, { stderr: (s) => errors.push(s) }), 2);
    assert.equal(errors.length, 1);
  }
  const output: string[] = [];
  assert.equal(
    await runDocs(["--help", "--kb", "missing"], {
      stdout: (s) => output.push(s),
    }),
    0,
  );
  assert.match(output.join(""), /Usage: simp-docs/);
  assert.equal(process.exitCode, before);
});

test("docs CLI exports pages, overwrites generated paths and preserves unrelated files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-docs-"));
  try {
    const out = path.join(root, "docs");
    await mkdir(out);
    await writeFile(path.join(out, "keep.txt"), "keep");
    const stdout: string[] = [];
    const stderr: string[] = [];
    const args = ["--kb", fixtureRoot, "--out", out];
    assert.equal(
      await runDocs(args, {
        stdout: (s) => stdout.push(s),
        stderr: (s) => stderr.push(s),
      }),
      0,
    );
    assert.match(stdout[0], /Wrote \d+ page\(s\) to/);
    assert.deepEqual(stderr, []);
    const page = path.join(out, "goals/send-zalo-message.md");
    assert.match(await readFile(page, "utf8"), /Recommended plan/);
    await writeFile(page, "stale");
    assert.equal(await runDocs(args, { stdout: () => {} }), 0);
    assert.match(await readFile(page, "utf8"), /Recommended plan/);
    assert.equal(await readFile(path.join(out, "keep.txt"), "utf8"), "keep");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("docs CLI rejects lint errors, overlapping trees and file destinations before writes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-docs-"));
  try {
    const kb = path.join(root, "kb");
    await mkdir(path.join(kb, "procedures"), { recursive: true });
    const source = path.join(kb, "procedures/a.md");
    const bytes = proc("A");
    await writeFile(source, bytes);
    const file = path.join(root, "file");
    await writeFile(file, "occupied");
    for (const out of [kb, path.join(kb, "docs"), root, file]) {
      const stdout: string[] = [],
        stderr: string[] = [];
      assert.equal(
        await runDocs(["--kb", kb, "--out", out], {
          stdout: (s) => stdout.push(s),
          stderr: (s) => stderr.push(s),
        }),
        2,
      );
      assert.deepEqual(stdout, []);
      assert.equal(stderr.length, 1);
      assert.equal(await readFile(source, "utf8"), bytes);
    }
    await writeFile(source, "invalid");
    const out = path.join(root, "bad-output");
    assert.equal(
      await runDocs(["--kb", kb, "--out", out], { stderr: () => {} }),
      2,
    );
    await assert.rejects(readdir(out), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("docs CLI rejects symlink aliases and escaping page directories before any page write", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-docs-"));
  try {
    const kb = path.join(root, "kb"),
      out = path.join(root, "out"),
      alias = path.join(root, "alias");
    await mkdir(path.join(kb, "procedures"), { recursive: true });
    await mkdir(out);
    const bytes = proc("A");
    const source = path.join(kb, "procedures/a.md");
    await writeFile(source, bytes);
    try {
      await symlink(
        kb,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      );
    } catch (err) {
      if (
        ["EPERM", "EACCES"].includes((err as NodeJS.ErrnoException).code ?? "")
      ) {
        t.skip("Platform disallows symlink creation");
        return;
      }
      throw err;
    }
    const errors: string[] = [];
    assert.equal(
      await runDocs(["--kb", kb, "--out", path.join(alias, "new")], {
        stderr: (s) => errors.push(s),
      }),
      2,
    );
    await symlink(
      path.join(kb, "procedures"),
      path.join(out, "procedures"),
      process.platform === "win32" ? "junction" : "dir",
    );
    // An earlier page must not be written before the later escaping destination is checked.
    await mkdir(path.join(kb, "goals"));
    await writeFile(path.join(kb, "goals/g.md"), goal(["procedure.a"]));
    assert.equal(
      await runDocs(["--kb", kb, "--out", out], {
        stderr: (s) => errors.push(s),
      }),
      2,
    );
    await assert.rejects(readdir(path.join(out, "goals")), { code: "ENOENT" });
    assert.equal(await readFile(source, "utf8"), bytes);
    assert.equal(errors.length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

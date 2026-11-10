import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createKB,
  createKBTools,
  exportDocs,
  fitSections,
  memorySource,
  renderResolvedGoal,
  resolveMessages,
  runDocs,
  runResolve,
  translateDiagnostic,
  builtInLocales,
} from "../src/index.js";
import { choiceYaml, fixture, goal, proc, state } from "./helpers.js";

const simp = (extra = "") =>
  `---\ntype: simp\nname: demo\ntitle: Demo\nsummary: Demo product\n${extra}---\n`;

const files = (simpExtra?: string) => ({
  ...(simpExtra === undefined ? {} : { "simp.md": simp(simpExtra) }),
  "goals/send.md": goal(["procedure.send"]),
  "procedures/send.md": proc(
    "Send",
    `preconditions: [state.ready]\navailability:\n  plans: [pro]\n${choiceYaml("pick", [["a", "procedure.setup"]])}`,
    "1. do send\n2. choice:pick",
  ),
  "procedures/setup.md": proc("Setup"),
  "states/ready.md": state("Ready", "procedure.setup"),
});

const page = (pages: { path: string; content: string }[], route: string) =>
  pages.find((p) => p.path === route)!.content;

test("language tags fall back from region to language, then to English", () => {
  assert.equal(
    resolveMessages("vi-VN").docs.steps,
    builtInLocales.vi.docs.steps,
  );
  assert.equal(resolveMessages("VI_vn").plan.check, "KIỂM TRA");
  assert.equal(resolveMessages("fr").docs.steps, "Steps");
  assert.equal(resolveMessages().docs.steps, "Steps");
});

test("custom languages override only the keys they define", () => {
  const ja = resolveMessages("ja-JP", { ja: { docs: { steps: "手順" } } });
  assert.equal(ja.docs.steps, "手順");
  assert.equal(ja.docs.warnings, "Warnings");
  const vi = resolveMessages("vi", { vi: { plan: { run: "CHẠY" } } });
  assert.equal(vi.plan.run, "CHẠY");
  assert.equal(vi.plan.check, "KIỂM TRA");
});

test("Vietnamese docs translate generated wording but keep paths and authored text", async () => {
  const kb = await createKB(memorySource(files()));
  assert.equal(kb.status.errors, 0);
  const english = kb.docs();
  const vietnamese = kb.docs({ locale: "vi" });
  assert.deepEqual(
    vietnamese.map((p) => p.path),
    english.map((p) => p.path),
  );
  const guide = page(vietnamese, "guides/send.md");
  assert.match(guide, /## Các bước/);
  assert.match(guide, /Kiểm tra \[Ready\]/);
  assert.match(guide, /Nếu chưa đáp ứng: làm theo \[Setup\]/);
  assert.match(guide, /do send/);
  assert.ok(!guide.includes("## Steps"));
  assert.ok(!guide.includes("If not satisfied"));
  const home = page(vietnamese, "index.md");
  assert.match(home, /\[Hướng dẫn\]\(guides\/index.md\)/);
  assert.match(home, /\[Khắc phục sự cố\]\(troubleshooting\/index.md\)/);
  assert.ok(
    home.indexOf("guides/index.md") < home.indexOf("troubleshooting/index.md"),
    "section order does not depend on translated titles",
  );
  const graph = exportDocs(kb.graph, { layout: "graph", locale: "vi" });
  assert.match(page(graph, "procedures/send.md"), /## Điều kiện tiên quyết/);
});

test("Vietnamese docs localize procedure Steps and Failure handling headings", async () => {
  const kb = await createKB(
    memorySource({
      "goals/send.md": goal(["procedure.send"]),
      "procedures/send.md": proc(
        "Send",
        "",
        "1. do send\n\n## Failure handling\nRetry later.\n\n```md\n## Steps\n```",
      ),
    }),
  );
  assert.equal(kb.status.errors, 0);
  for (const layout of ["site", "graph"] as const) {
    const pages = kb.docs({ layout, locale: "vi" });
    const procedure = pages.find((p) =>
      p.content.includes("\n# Send\n"),
    )!.content;
    assert.match(procedure, /^## Các bước$/m);
    assert.match(procedure, /^## Xử lý lỗi$/m);
    assert.ok(!/^## Failure handling$/m.test(procedure));
    assert.match(procedure, /```md\n## Steps\n```/, "code stays literal");
  }
  const english = kb.docs({ layout: "graph" });
  assert.match(page(english, "procedures/send.md"), /^## Steps$/m);
  assert.match(page(english, "procedures/send.md"), /^## Failure handling$/m);
});

test("simp.md language is the default and an explicit locale overrides it", async () => {
  const kb = await createKB(memorySource(files("language: vi\n")));
  assert.equal(kb.status.errors, 0);
  assert.match(page(kb.docs(), "guides/send.md"), /## Các bước/);
  assert.match(page(kb.docs({ locale: "en" }), "guides/send.md"), /## Steps/);
  const resolved = kb.resolveGoal("goal.send");
  assert.match((await kb.render(resolved)).text, /\*\*KIỂM TRA\*\*/);
  assert.match(
    (await kb.render(resolved, { locale: "en" })).text,
    /\*\*CHECK\*\*/,
  );
});

test("configured locales extend the catalog used by docs and rendering", async () => {
  const kb = await createKB(memorySource(files("language: ja\n")), {
    locales: { ja: { docs: { steps: "手順" }, plan: { check: "確認" } } },
  });
  assert.match(page(kb.docs(), "guides/send.md"), /## 手順/);
  assert.match(
    (await kb.render(kb.resolveGoal("goal.send"))).text,
    /\*\*確認\*\*.*\n[\s\S]*\*\*RUN\*\*/,
  );
});

test("diagnostics stay English in results and are translated when rendered", async () => {
  const kb = await createKB(memorySource(files()));
  const resolved = kb.resolveGoal("goal.send", {
    tenant: { plan: "free" },
    choices: { pick: "missing" },
  });
  const best = resolved.alternatives[0];
  assert.deepEqual(best.unavailableReasons, [
    "requires plan: pro (procedure.send)",
  ]);
  assert.ok(
    best.warnings.includes(
      'choice "pick" has no option "missing"; showing all',
    ),
  );
  const text = renderResolvedGoal(resolved, { locale: "vi" }).text;
  assert.match(text, /không khả dụng — yêu cầu gói: pro \(procedure\.send\)/);
  assert.match(
    text,
    /lựa chọn "pick" không có phương án "missing"; hiển thị tất cả/,
  );
  assert.match(
    page(
      kb.docs({
        locale: "vi",
        tenant: { plan: "free" },
        choices: { pick: "missing" },
      }),
      "guides/send.md",
    ),
    /## Cảnh báo\n\n- lựa chọn "pick"/,
  );
});

test("unknown diagnostics pass through unchanged", () => {
  const vi = resolveMessages("vi");
  assert.equal(translateDiagnostic("custom reason", vi), "custom reason");
  assert.equal(
    translateDiagnostic("procedure.a requires permission: admin", vi),
    "procedure.a yêu cầu quyền: admin",
  );
});

test("omission notice follows the output language", () => {
  const sections = [
    { name: "goal", priority: 0, text: "# G" },
    { name: "capabilities", priority: 3, text: "x".repeat(400) },
  ];
  const r = fitSections(sections, 5, resolveMessages("vi"));
  assert.deepEqual(r.omitted, ["capabilities"]);
  assert.match(r.text, /_Đã lược bỏ do giới hạn độ dài: capabilities\./);
  assert.match(fitSections(sections, 5).text, /_Omitted for budget: /);
});

test("simp.md language must be a language tag", async () => {
  const ok = await fixture({ "simp.md": simp("language: vi-VN\n") });
  assert.equal(ok.errorCount, 0);
  const bad = await fixture({ "simp.md": simp("language: not a tag\n") });
  assert.ok(bad.errorCount > 0);
});

test("simp-docs and simp-resolve accept --lang", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "simp-i18n-"));
  try {
    const kbDir = path.join(dir, "kb");
    const { writeFile, mkdir } = await import("node:fs/promises");
    for (const [rel, content] of Object.entries(files())) {
      await mkdir(path.dirname(path.join(kbDir, rel)), { recursive: true });
      await writeFile(path.join(kbDir, rel), content);
    }
    const out: string[] = [];
    const ctx = { stdout: (s: string) => out.push(s), stderr: () => {} };
    const outDir = path.join(dir, "out");
    assert.equal(
      await runDocs(["--kb", kbDir, "--out", outDir, "--lang", "vi"], ctx),
      0,
    );
    assert.match(
      await readFile(path.join(outDir, "guides/send.md"), "utf8"),
      /## Các bước/,
    );
    assert.equal(
      await runResolve(["goal.send", "--kb", kbDir, "--lang", "vi"], ctx),
      0,
    );
    assert.match(out.join("\n"), /\*\*KIỂM TRA\*\*/);
    assert.equal(await runResolve(["goal.send", "--lang", " "], ctx), 2);

    const tools = await createKBTools(kbDir);
    const r = await tools.call("resolve_goal", {
      goal_id: "goal.send",
      language: "vi",
    });
    assert.ok(!r.isError, r.content);
    assert.match(r.content, /## Đề xuất: Send/);
    const plain = await tools.call("resolve_goal", { goal_id: "goal.send" });
    assert.match(plain.content, /## Recommended: Send/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

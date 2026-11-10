import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  createKB,
  docAssets,
  exportDocs,
  lintKB,
  renderResolvedGoal,
  resolveAsset,
  resolveGoal,
  runDocs,
} from "../src/index.js";
import { withoutLocalImages } from "../src/assets.js";
import { fixture, goal } from "./helpers.js";

const steps = [
  "1. Open the form",
  "",
  "   ![Send form with a To field](../assets/send/form.png)",
  "",
  "2. Fill ![Filled form](../assets/send/filled.png) and send `![x](../y.png)`",
  "",
  "   ```md",
  "   ![not an image](../assets/code.png)",
  "   ```",
  "",
  "## Failure handling",
  "",
  "![Error banner](../assets/send/error.png)",
].join("\n");
const files = (extra: Record<string, string> = {}) => ({
  "goals/send.md": goal(["procedure.send"]),
  "procedures/send.md": `---\ntype: procedure\ntitle: Send\nsummary: Send\nproduces: [state.ready]\npreconditions: [state.open]\n---\n## Steps\n\n${steps}\n`,
  "states/open.md":
    "---\ntype: state\ntitle: Open\nsummary: Open\ncheck: look at the badge\nsatisfied_by: [procedure.send]\n---\n![Badge reads Open](../assets/open.png)\n",
  "states/ready.md":
    "---\ntype: state\ntitle: Ready\nsummary: Ready\ncheck: look\nsatisfied_by: [procedure.send]\n---\n",
  "assets/send/form.png": "png",
  "assets/send/filled.png": "png",
  "assets/send/error.png": "png",
  "assets/open.png": "png",
  ...extra,
});

test("lint reports missing images and images without alt text", async () => {
  const good = await fixture(files());
  assert.deepEqual(
    good.issues.filter((i) => /^W11[01]$/.test(i.code)),
    [],
  );
  const { issues } = await fixture(
    files({
      "capabilities/c.md":
        "---\ntype: capability\ntitle: C\nsummary: C\n---\n![](../assets/open.png)\n![Gone](../assets/gone.png)\n![Out](../../x.png)\n![Web](https://x.test/a.png)\n",
    }),
  );
  assert.deepEqual(
    issues
      .filter((i) => i.path === "capabilities/c.md" && i.code !== "W101")
      .map((i) => `${i.line} ${i.code} ${i.message}`),
    [
      '7 W110 image "../assets/gone.png" does not exist',
      '8 W110 image "../../x.png" is outside the KB',
      '6 W111 image "../assets/open.png" has no alt text; agents read only the alt text',
    ],
  );
});

test("plans take local images out of step text and keep their alt text with the step", async () => {
  const { graph } = await fixture(files());
  const [check, run] = resolveGoal(graph, "goal.send").alternatives[0].plan;
  assert.deepEqual(check.kind === "check" && check.images, [
    { src: "assets/open.png", alt: "Badge reads Open" },
  ]);
  assert.ok(run.kind === "run");
  assert.deepEqual(run.steps, [
    "Open the form",
    "Fill and send `![x](../y.png)`",
  ]);
  assert.deepEqual(run.images, [
    { src: "assets/send/form.png", alt: "Send form with a To field", step: 1 },
    { src: "assets/send/filled.png", alt: "Filled form", step: 2 },
  ]);
  const { text } = renderResolvedGoal(resolveGoal(graph, "goal.send"));
  assert.match(
    text,
    /How: look at the badge\n {3}_Screen:_ Badge reads Open\n/,
  );
  assert.match(
    text,
    / {3}1\. Open the form\n {6}_Screen:_ Send form with a To field\n {3}2\. Fill and send `!\[x\]\(\.\.\/y\.png\)`\n {6}_Screen:_ Filled form/,
  );
});

test("removing step images leaves other spacing and inline code as written", () => {
  assert.equal(
    withoutLocalImages(
      'Run  `printf "a  b"` then ![Done](done.png)  check\tit ![x](https://e.x/y.png)',
      "procedures/p.md",
    ),
    'Run  `printf "a  b"` then check\tit ![x](https://e.x/y.png)',
  );
  assert.equal(withoutLocalImages("![a](a.png)Next", "p.md"), "Next");
});

test("docs rewrite image paths for each published page and goal guides show step images", async () => {
  const { graph } = await fixture(files());
  const pages = new Map(exportDocs(graph).map((p) => [p.path, p.content]));
  const howTo = pages.get("guides/how-to/send.md")!;
  assert.match(howTo, /\]\(\.\.\/\.\.\/assets\/send\/form\.png\)/);
  assert.match(
    howTo,
    /Fill !\[Filled form\]\(\.\.\/\.\.\/assets\/send\/filled\.png\)/,
  );
  assert.match(howTo, /!\[not an image\]\(\.\.\/assets\/code\.png\)/);
  assert.match(
    pages.get("troubleshooting/open.md")!,
    /!\[Badge reads Open\]\(\.\.\/assets\/open\.png\)/,
  );
  const guide = pages.get("guides/send.md")!;
  assert.match(
    guide,
    /look at the badge\n {3}!\[Badge reads Open\]\(\.\.\/assets\/open\.png\)/,
  );
  assert.match(
    guide,
    / {3}1\. Open the form\n {6}!\[Send form with a To field\]\(\.\.\/assets\/send\/form\.png\)\n {3}2\. Fill and send `!\[x\]\(\.\.\/y\.png\)`\n {6}!\[Filled form\]/,
  );
  assert.deepEqual(docAssets(graph), [
    "assets/open.png",
    "assets/send/error.png",
    "assets/send/filled.png",
    "assets/send/form.png",
  ]);
  assert.equal(resolveAsset("capabilities/c.md", "../../x.png"), undefined);
  assert.equal(resolveAsset("simp.md", "a%20b.png#x"), "a b.png");
  assert.equal(resolveAsset("simp.md", "a%23b%3F.png"), "a#b?.png");
  assert.equal(resolveAsset("simp.md", "a%2Fb.png"), "a%2Fb.png");
  const odd = (
    await fixture(
      files({
        "capabilities/c.md":
          "---\ntype: capability\ntitle: C\nsummary: C\n---\n![Hash](../assets/a%23b.png)\n![Page](../goals/send.md)\n",
      }),
    )
  ).graph;
  // A Markdown target is never copied as an image, so it cannot overwrite an exported page.
  assert.ok(docAssets(odd).includes("assets/a#b.png"));
  assert.ok(!docAssets(odd).includes("goals/send.md"));
  const escaped = exportDocs(odd, { layout: "graph" }).find(
    (p) => p.path === "capabilities/c.md",
  )!.content;
  assert.match(escaped, /!\[Hash\]\(\.\.\/assets\/a%23b\.png\)/);
});

test("simp-docs copies referenced images and skips missing ones", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-images-"));
  try {
    const kb = path.join(root, "kb");
    const kbFiles = files({ "assets/unused.png": "x", ".env": "SECRET=1" });
    kbFiles["states/ready.md"] += "![Env](../.env)\n";
    for (const [rel, content] of Object.entries(kbFiles)) {
      await mkdir(path.dirname(path.join(kb, rel)), { recursive: true });
      await writeFile(path.join(kb, rel), content);
    }
    await rm(path.join(kb, "assets/open.png"));
    assert.equal((await createKB(kb)).status.errors, 0);
    const out: string[] = [];
    const err: string[] = [];
    const site = path.join(root, "site");
    assert.equal(
      await runDocs(["--kb", kb, "--out", site], {
        stdout: (s) => out.push(s),
        stderr: (s) => err.push(s),
      }),
      0,
    );
    assert.match(out.join("\n"), /and 3 image\(s\)/);
    assert.match(err.join("\n"), /Skipped 1 missing image/);
    assert.equal(
      await readFile(path.join(site, "assets/send/form.png"), "utf8"),
      "png",
    );
    await assert.rejects(readFile(path.join(site, "assets/unused.png")));
    await assert.rejects(readFile(path.join(site, ".env")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("lint and simp-docs agree on symlinked images: inside the KB they count, outside they are missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "simp-images-"));
  try {
    const kb = path.join(root, "kb");
    // The two step images become symlinks below.
    const {
      "assets/send/form.png": _form,
      "assets/send/filled.png": _filled,
      ...kbFiles
    } = files({ "shared/form.png": "shared", "../brand.png": "x" });
    for (const [rel, content] of Object.entries(kbFiles)) {
      await mkdir(path.dirname(path.join(kb, rel)), { recursive: true });
      await writeFile(path.join(kb, rel), content);
    }
    await symlink(
      "../../shared/form.png",
      path.join(kb, "assets/send/form.png"),
    );
    await symlink(
      "../../../brand.png",
      path.join(kb, "assets/send/filled.png"),
    );
    const { issues } = await lintKB(kb);
    assert.deepEqual(
      issues.filter((i) => i.code === "W110").map((i) => i.message),
      ['image "../assets/send/filled.png" does not exist'],
    );
    const out: string[] = [];
    const err: string[] = [];
    const site = path.join(root, "site");
    assert.equal(
      await runDocs(["--kb", kb, "--out", site], {
        stdout: (s) => out.push(s),
        stderr: (s) => err.push(s),
      }),
      0,
    );
    assert.match(err.join("\n"), /Skipped 1 missing image/);
    assert.equal(
      await readFile(path.join(site, "assets/send/form.png"), "utf8"),
      "shared",
    );
    await assert.rejects(readFile(path.join(site, "assets/send/filled.png")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

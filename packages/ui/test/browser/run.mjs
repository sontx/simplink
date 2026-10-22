import { unzipSync, strFromU8 } from "fflate";
/* global window */
import { build, createServer, preview } from "vite";
import { chromium } from "playwright-core";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { createKB } from "@sontx/simplink-core";
import { createSimpNodeHandler } from "@sontx/simplink-node";

const root = fileURLToPath(new URL("../../", import.meta.url));
const configFile = path.join(root, "vite.config.ts");
const entry = path.join(root, "__smoke.html");
const output = await mkdtemp(path.join(tmpdir(), "simplink-browser-"));
let browser;
let dev;
let production;
try {
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    browser = await chromium.launch({ channel: "msedge", headless: true });
  }
  await writeFile(
    entry,
    (await readFile(new URL("./smoke.html", import.meta.url), "utf8")).replace(
      "../test/browser/smoke.ts",
      "/@fs/" +
        fileURLToPath(new URL("./smoke.ts", import.meta.url)).replaceAll(
          "\\",
          "/",
        ),
    ),
  );
  const page = await browser.newPage();
  // Knowledge base actions live in the header menu.
  async function knowledgeBaseAction(name) {
    await page
      .getByRole("button", { name: "Knowledge base actions", exact: true })
      .click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  }

  async function check(url, label) {
    const errors = [];
    const onError = (error) => errors.push(error.message);
    page.on("pageerror", onError);
    await page.goto(url);
    await page.waitForFunction(() => window.__smoke, undefined, {
      timeout: 60000,
    });
    const result = await page.evaluate(() => window.__smoke);
    assert.equal(result.ok, true, JSON.stringify({ result, errors }));
    assert.deepEqual(errors, []);
    console.log(`${label}: ${JSON.stringify(result)}`);
    page.off("pageerror", onError);
  }
  process.env.SIMPLINK_UI_BASE = "/";
  dev = await createServer({
    configFile,
    // The devtools plugin starts its own event-bus server without teardown.
    mode: "test",
    server: { host: "127.0.0.1", port: 0 },
  });
  await dev.listen();
  await check(`${dev.resolvedUrls.local[0]}__smoke.html`, "dev");
  await dev.close();
  dev = undefined;
  process.env.SIMPLINK_UI_BASE = "/sub/";
  await build({
    configFile,
    logLevel: "warn",
    build: {
      outDir: output,
      emptyOutDir: true,
      rollupOptions: {
        input: { main: path.join(root, "index.html"), smoke: entry },
      },
    },
  });
  production = await preview({
    configFile,
    build: { outDir: output },
    preview: { host: "127.0.0.1", port: 0 },
  });
  await check(
    `${production.resolvedUrls.local[0]}__smoke.html`,
    "production /sub/",
  );
  assert.equal(
    await readFile(path.join(output, "404.html"), "utf8"),
    await readFile(path.join(output, "index.html"), "utf8"),
  );
  await page.goto(production.resolvedUrls.local[0]);
  await page
    .getByRole("button", { name: "Open KB folder", exact: true })
    .waitFor();
  console.log("production open screen and SPA fallback verified");
  // Connect form against real simp nodes: one allows this origin, one does not.
  const crmKB = await createKB(
    fileURLToPath(
      new URL("../../../../test/fixtures/mesh/crm/", import.meta.url),
    ),
  );
  const origin = new URL(production.resolvedUrls.local[0]).origin;
  for (const allowed of [false, true]) {
    const node = createHttpServer(
      createSimpNodeHandler({
        kb: crmKB,
        token: "secret",
        allowedOrigins: allowed ? [origin] : [],
      }),
    ).listen(0, "127.0.0.1");
    await once(node, "listening");
    try {
      await page
        .getByRole("textbox", { name: "Simp node URL", exact: true })
        .fill(`http://127.0.0.1:${node.address().port}`);
      await page
        .getByRole("textbox", { name: "Token (optional)", exact: true })
        .fill("secret");
      await page.getByRole("button", { name: "Connect", exact: true }).click();
      if (!allowed) {
        await page
          .getByRole("alert")
          .getByText(/allowed-origin/)
          .waitFor();
        continue;
      }
      await page.getByRole("link", { name: "Nodes", exact: true }).click();
      await page
        .getByRole("cell", { name: "Import customers" })
        .first()
        .click();
      await page.getByRole("tab", { name: "Source", exact: true }).click();
      await page.getByText("type: goal").first().waitFor();
      assert.equal(
        await page.getByRole("button", { name: "Save file" }).count(),
        0,
      );
      await page.getByRole("link", { name: "Nodes", exact: true }).click();
      assert.equal(
        await page.getByRole("button", { name: "Add goal" }).count(),
        0,
      );
      // A refresh reconnects with the tab's saved URL and token and keeps the route.
      await page.reload();
      await page
        .getByRole("cell", { name: "Import customers" })
        .first()
        .waitFor();
      await knowledgeBaseAction("Close knowledge base");
      await page.reload();
      await page
        .getByRole("button", { name: "Open KB folder", exact: true })
        .waitFor();
    } finally {
      node.closeAllConnections();
      node.close();
    }
  }
  console.log(
    "Connect form browses an allowed simp node read-only and reports CORS denial",
  );
  // Exercise the actual fallback UI with a real directory upload.
  await page.evaluate(() => {
    delete window.showDirectoryPicker;
  });
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Open KB folder", exact: true })
    .click();
  await (
    await chooser
  ).setFiles(
    fileURLToPath(new URL("../../../../test/fixtures/kb/", import.meta.url)),
  );
  await page
    .getByRole("button", { name: "Download KB (.zip)", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Docs", exact: true }).click();
  for (const layout of ["site", "graph"]) {
    await page
      .getByRole("tab", {
        name: layout === "site" ? "Site" : "Graph",
        exact: true,
      })
      .click();
    const docsDownloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download docs (.zip)", exact: true })
      .click();
    const docsDownload = await docsDownloadEvent;
    assert.equal(docsDownload.suggestedFilename(), `kb-docs-${layout}.zip`);
    const docsZip = unzipSync(await readFile(await docsDownload.path()));
    if (layout === "site") assert.ok(docsZip["index.md"]);
    const guide =
      layout === "site"
        ? "guides/messaging/send-a-message.md"
        : "goals/send-zalo-message.md";
    assert.match(strFromU8(docsZip[guide]), /# /);
  }
  console.log("Docs UI downloads Site and Graph Markdown ZIPs");
  await page.getByRole("link", { name: "Playground", exact: true }).click();
  await page
    .getByRole("textbox", { name: "What would you like to do?" })
    .fill("zalo");
  const playground = page.locator("form");
  await playground
    .getByRole("button", { name: "Find answers", exact: true })
    .click();
  await page.getByRole("heading", { name: "Suggested goals" }).waitFor();
  await page
    .getByRole("button", { name: "Make a plan", exact: true })
    .first()
    .click();
  await playground
    .getByRole("button", { name: "Plan a goal", exact: true })
    .click();
  await page.getByRole("heading", { name: "Your plan", exact: true }).waitFor();
  await page.getByText("Tailor your plan", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Channel connected", exact: true })
    .click();
  await page.getByRole("option", { name: "Yes", exact: true }).click();
  await page
    .getByRole("combobox", {
      name: "How is the recipient identified?",
      exact: true,
    })
    .click();
  await page.getByRole("option").nth(1).click();
  await playground
    .getByRole("button", { name: "Plan a goal", exact: true })
    .click();
  await page.getByRole("heading", { name: "Your plan", exact: true }).waitFor();
  for (const [action, item, expected] of [
    ["Plan a procedure", "Send a message", "Your plan"],
    ["View details", "Send a Zalo message", "Send a Zalo message"],
    ["Explore connections", "Send a Zalo message", "Connected items"],
  ]) {
    await page
      .getByRole("button", { name: action, exact: true })
      .first()
      .click();
    await page.getByRole("combobox", { name: "Choose an item…" }).click();
    await page.getByRole("combobox").last().fill(item);
    await page.getByRole("option").filter({ hasText: item }).first().click();
    await playground.getByRole("button", { name: action, exact: true }).click();
    await page.getByRole("heading", { name: expected, exact: true }).waitFor();
  }
  console.log("Playground: all five actions render readable results");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => window.document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("link", { name: "Nodes", exact: true }).click();
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  await page.getByLabel("Path within goals").fill("browser-created");
  await page.getByLabel("Title", { exact: true }).fill("Browser-created goal");
  await page
    .getByLabel("Summary", { exact: true })
    .fill("Created in the browser");
  await page.getByRole("button", { name: "Create node", exact: true }).click();
  await page
    .getByRole("heading", { name: "Browser-created goal", exact: true })
    .first()
    .waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await page
    .getByRole("heading", { name: "Browser-created goal", exact: true })
    .first()
    .waitFor();
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  const editor = page.getByRole("textbox", {
    name: "Markdown source",
    exact: true,
  });
  await editor.press("Control+End");
  await page.keyboard.insertText("\nUnsaved editor draft");
  await page.getByText("Unsaved changes", { exact: true }).waitFor();
  let draftPrompt = "";
  page.once("dialog", async (dialog) => {
    draftPrompt = dialog.message();
    await dialog.dismiss();
  });
  await knowledgeBaseAction("Close knowledge base");
  assert.match(draftPrompt, /unsaved changes.*editor/i);
  await page.getByRole("button", { name: "Save file", exact: true }).click();
  await page.getByText("Saved in memory", { exact: true }).waitFor();
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download KB (.zip)", exact: true })
    .click();
  const download = await downloadEvent;
  const zip = unzipSync(await readFile(await download.path()));
  assert.match(
    strFromU8(zip["goals/browser-created.md"]),
    /Browser-created goal/,
  );
  page.once("dialog", (dialog) => dialog.dismiss());
  await knowledgeBaseAction("Close knowledge base");
  await page
    .getByRole("heading", { name: "Browser-created goal", exact: true })
    .first()
    .waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await knowledgeBaseAction("Close knowledge base");
  await page
    .getByRole("button", { name: "Open KB folder", exact: true })
    .waitFor();
  const secondChooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Open KB folder", exact: true })
    .click();
  await (
    await secondChooser
  ).setFiles(
    fileURLToPath(new URL("../../../../test/fixtures/kb/", import.meta.url)),
  );
  await page.getByRole("link", { name: "Nodes", exact: true }).click();
  assert.equal(
    await page.getByText("Browser-created goal", { exact: true }).count(),
    0,
  );
  await knowledgeBaseAction("Close knowledge base");
  for (const [name, message] of [
    ["AbortError", "Folder selection cancelled."],
    ["NotAllowedError", "Folder access denied"],
  ]) {
    await page.evaluate((name) => {
      window.showDirectoryPicker = async () => {
        throw new DOMException("Test picker response", name);
      };
    }, name);
    await page
      .getByRole("button", { name: "Open KB folder", exact: true })
      .click();
    await page.getByText(message, { exact: false }).waitFor();
  }
  console.log(
    "memory UI create/reload/zip/close guards, folder isolation, picker cancel/denial verified",
  );
  // A real browser directory handle exercises direct writes and persisted reopening.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getDirectoryHandle("direct-browser", {
      create: true,
    });
    const folder = await handle.getDirectoryHandle("capabilities", {
      create: true,
    });
    const file = await folder.getFileHandle("direct.md", { create: true });
    const writer = await file.createWritable();
    await writer.write(
      "---\ntype: capability\ntitle: Direct browser folder\nsummary: Browser handle test\n---\n",
    );
    await writer.close();
    window.showDirectoryPicker = async () => handle;
  });
  await page
    .getByRole("button", { name: "Open KB folder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Knowledge base actions", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Download KB (.zip)", exact: true })
      .count(),
    0,
  );
  await page.getByRole("link", { name: "Nodes", exact: true }).click();
  await page.getByRole("button", { name: "Add goal", exact: true }).click();
  await page.getByLabel("Path within goals").fill("direct-created");
  await page.getByLabel("Title", { exact: true }).fill("Direct-created goal");
  await page
    .getByLabel("Summary", { exact: true })
    .fill("Saved through a real directory handle");
  await page.getByRole("button", { name: "Create node", exact: true }).click();
  await page
    .getByRole("heading", { name: "Direct-created goal", exact: true })
    .first()
    .waitFor();
  const directRaw = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getDirectoryHandle("direct-browser");
    const folder = await handle.getDirectoryHandle("goals");
    return (
      await (await folder.getFileHandle("direct-created.md")).getFile()
    ).text();
  });
  assert.match(directRaw, /Direct-created goal/);
  await page.reload();
  await page
    .getByRole("heading", { name: "Direct-created goal", exact: true })
    .first()
    .waitFor();
  await page.getByRole("tab", { name: "Source", exact: true }).click();
  await page.getByRole("button", { name: "Delete file", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  await page.waitForURL(/\/nodes(?:\?.*)?$/);
  assert.equal(
    await page.evaluate(async () => {
      const root = await navigator.storage.getDirectory();
      const handle = await root.getDirectoryHandle("direct-browser");
      const folder = await handle.getDirectoryHandle("goals");
      try {
        await folder.getFileHandle("direct-created.md");
        return true;
      } catch (error) {
        if (error.name !== "NotFoundError") throw error;
        return false;
      }
    }),
    false,
  );
  await page.evaluate(() => {
    window.showDirectoryPicker = () =>
      new Promise((_resolve, reject) => {
        window.__cancelFolder = () =>
          reject(new DOMException("Cancelled", "AbortError"));
      });
  });
  await knowledgeBaseAction("Open another knowledge base");
  await page.locator('[aria-busy="true"]').waitFor();
  const clickable = await page
    .getByRole("button", { name: "Knowledge base actions", exact: true })
    .click({ trial: true, timeout: 750 })
    .then(
      () => true,
      () => false,
    );
  assert.equal(
    clickable,
    false,
    "Workspace interaction is blocked during a folder transition",
  );
  await page.evaluate(() => window.__cancelFolder());
  await page.locator('[aria-busy="false"]').waitFor();
  await knowledgeBaseAction("Close knowledge base");
  await page
    .getByRole("heading", { name: "Open a knowledge base", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("heading", { name: "Open a knowledge base", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Reopen direct-browser", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Knowledge base actions", exact: true })
    .waitFor();
  await page.reload();
  await page
    .getByRole("button", { name: "Knowledge base actions", exact: true })
    .waitFor();
  console.log(
    "real directory handle create/delete, IndexedDB reopen and transition interaction guard verified",
  );
} finally {
  await browser?.close();
  await dev?.close();
  await production?.close();
  await rm(entry, { force: true });
  // output is the mkdtemp directory created above, never a user-supplied path.
  await rm(output, { recursive: true, force: true });
}

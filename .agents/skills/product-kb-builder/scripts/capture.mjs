#!/usr/bin/env node
// Capture, highlight, and compress the KB's screenshots from a shot list (see references/screenshots.md).
// Usage: node capture.mjs [--shots kb/assets/shots.json] [--kb kb] [--base-url URL] [--only <out|node>]
//                         [--deps <dir with node_modules>] [--storage-state auth.json] [--headed] [--check]
//
// Dependencies (DEPS below is the one list; --check verifies all of them and prints the install command):
//   - Node.js 20 or newer (tested on 22)
//   - playwright (or playwright-core / @playwright/test), found from the current directory or --deps
//   - sharp, found the same way
//   - a browser: installed Chrome or Edge, else Playwright's Chromium (`playwright install chromium`;
//     on Linux `playwright install --with-deps chromium`, which needs root for the system libraries)
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    shots: { type: "string" },
    kb: { type: "string", default: "kb" },
    "base-url": { type: "string" },
    only: { type: "string" },
    deps: { type: "string" },
    "storage-state": { type: "string" },
    headed: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
  },
});
const kb = path.resolve(values.kb);
const shotsFile = path.resolve(values.shots ?? path.join(kb, "assets", "shots.json"));
const fail = (message) => {
  console.error(message);
  process.exit(2);
};

// ---------- validate the shot list ----------

const IMAGE = /\.(webp|png|jpe?g)$/i;
const ACTIONS = ["goto", "click", "fill", "press", "select", "check", "hover", "wait", "waitFor", "evaluate"];
let spec;
// --check before any shot is written checks the dependencies only.
const noShots = values.check && !existsSync(shotsFile);
try {
  spec = noShots ? { shots: [] } : JSON.parse(readFileSync(shotsFile, "utf8"));
} catch (error) {
  fail(`Cannot read ${shotsFile}: ${error.message}`);
}
const problems = [];
const actionList = (list, where) => {
  if (list === undefined) return;
  if (!Array.isArray(list)) return problems.push(`${where}: expected an array of actions`);
  list.forEach((action, i) => {
    const keys = Object.keys(action ?? {});
    const name = keys.find((key) => ACTIONS.includes(key));
    if (!name) problems.push(`${where}[${i}]: one of ${ACTIONS.join(", ")} is required`);
    if (name === "fill" && typeof action.value !== "string")
      problems.push(`${where}[${i}]: fill needs a "value"`);
  });
};
// A misspelled key (e.g. "hightlight") would silently do nothing, so unknown keys are errors.
const TOP_KEYS = ["baseUrl", "setupUrl", "setup", "viewport", "deviceScaleFactor", "locale", "timezoneId", "colorScheme", "maxWidth", "quality", "budgetKB", "highlightColor", "shots"];
const SHOT_KEYS = ["out", "node", "step", "steps", "note", "url", "actions", "highlight", "mask", "clip", "padding", "fullPage"];
const unknown = (object, keys, where) => {
  for (const key of Object.keys(object ?? {}))
    if (!keys.includes(key)) problems.push(`${where}: unknown key "${key}" (allowed: ${keys.join(", ")})`);
};
unknown(spec, TOP_KEYS, "shot list");
if (!noShots && (!Array.isArray(spec?.shots) || !spec.shots.length))
  problems.push(`"shots" must be a non-empty array`);
actionList(spec?.setup, "setup");
const outs = new Set();
for (const [i, shot] of (spec?.shots ?? []).entries()) {
  const at = `shots[${i}]`;
  unknown(shot, SHOT_KEYS, at);
  if (typeof shot?.out !== "string" || !IMAGE.test(shot.out))
    problems.push(`${at}.out: a .webp, .png or .jpg path relative to the KB root is required`);
  else {
    const out = path.resolve(kb, shot.out);
    if (!out.startsWith(path.join(kb, "assets") + path.sep))
      problems.push(`${at}.out: keep images under ${path.join(values.kb, "assets")}/`);
    if (outs.has(out)) problems.push(`${at}.out: duplicate of an earlier shot`);
    outs.add(out);
  }
  if (typeof shot?.url !== "string") problems.push(`${at}.url: required (absolute, or relative to baseUrl)`);
  if (shot?.node !== undefined && !/^(procedure|state|capability)\./.test(shot.node))
    problems.push(`${at}.node: only procedure, state and capability nodes take images`);
  if (shot?.mask !== undefined && !(Array.isArray(shot.mask) && shot.mask.every((s) => typeof s === "string")))
    problems.push(`${at}.mask: an array of Playwright selectors`);
  const step = (n) => Number.isInteger(n) && n > 0;
  if (shot?.step !== undefined && !step(shot.step)) problems.push(`${at}.step: a step number (1, 2, …)`);
  if (shot?.steps !== undefined && !(Array.isArray(shot.steps) && shot.steps.length && shot.steps.every(step)))
    problems.push(`${at}.steps: an array of step numbers`);
  if (shot?.step !== undefined && shot?.steps !== undefined) problems.push(`${at}: use "step" or "steps", not both`);
  if (shot?.highlight !== undefined) {
    if (!Array.isArray(shot.highlight)) problems.push(`${at}.highlight: an array of selectors or { selector, label }`);
    else
      shot.highlight.forEach((h, j) => {
        const where = `${at}.highlight[${j}]`;
        if (typeof h === "string") return;
        unknown(h, ["selector", "label"], where);
        if (typeof h?.selector !== "string") problems.push(`${where}.selector: a Playwright selector`);
        if (h?.label !== undefined && !/^[0-9A-Za-z]{1,3}$/.test(String(h.label)))
          problems.push(`${where}.label: 1–3 letters or digits, usually the step number`);
        // A step-numbered marker must name a step this image covers.
        if (shot.steps && /^\d+$/.test(String(h?.label ?? "")) && !shot.steps.includes(Number(h.label)))
          problems.push(`${where}.label: step ${h.label} is not in "steps" ${JSON.stringify(shot.steps)}`);
      });
  }
  actionList(shot?.actions, `${at}.actions`);
}
if (problems.length) fail(`Invalid ${shotsFile}:\n- ${problems.join("\n- ")}`);

// ---------- load dependencies from the project (or --deps), never from this skill ----------

// The versions this script was tested with; install exactly these.
const DEPS = { playwright: "1.64.1", sharp: "0.35.5" };
const INSTALL =
  `Install them outside the product (ask the user first; never add them to the product's dependencies):\n` +
  `  npm i --prefix <scratch>/capture-deps ${Object.entries(DEPS)
    .map(([name, version]) => `${name}@${version}`)
    .join(" ")}\n` +
  `then pass --deps <scratch>/capture-deps.`;

if (Number(process.versions.node.split(".")[0]) < 20)
  fail(`Node.js 20 or newer is required (this is ${process.version}).`);

// Read from the package's own package.json above its entry file; some packages don't export it.
function versionOf(entry, name) {
  for (let dir = path.dirname(entry); dir !== path.dirname(dir); dir = path.dirname(dir)) {
    const manifest = path.join(dir, "package.json");
    if (!existsSync(manifest)) continue;
    const pkg = JSON.parse(readFileSync(manifest, "utf8"));
    if (pkg.name === name) return pkg.version;
  }
  return "?";
}

async function load(...names) {
  const roots = [values.deps, process.cwd()].filter(Boolean);
  for (const root of roots)
    for (const name of names)
      try {
        const entry = createRequire(path.join(path.resolve(root), "noop.js")).resolve(name);
        const mod = await import(pathToFileURL(entry).href);
        return { mod: mod.default ?? mod, name, version: versionOf(entry, name) };
      } catch {
        /* try the next */
      }
  return undefined;
}
const playwrightDep = await load("playwright", "playwright-core", "@playwright/test");
const sharpDep = await load("sharp");
if (!playwrightDep || !sharpDep)
  fail(`Missing ${[!playwrightDep && "playwright", !sharpDep && "sharp"].filter(Boolean).join(" and ")}. ${INSTALL}`);
const playwright = playwrightDep.mod;
const sharp = sharpDep.mod;

// ---------- capture ----------

const baseUrl = values["base-url"] ?? spec.baseUrl;
const viewport = spec.viewport ?? { width: 1280, height: 800 };
const maxWidth = spec.maxWidth ?? 1600;
const quality = spec.quality ?? 80;
const budget = (spec.budgetKB ?? 250) * 1024;
const color = spec.highlightColor ?? "#e11d48";

async function launch() {
  const opts = { headless: !values.headed };
  for (const channel of ["chrome", "msedge", undefined])
    try {
      const browser = await playwright.chromium.launch(channel ? { ...opts, channel } : opts);
      return { browser, channel: channel ?? "playwright chromium" };
    } catch {
      /* try the next browser */
    }
  fail(
    "No browser found: install Chrome or Edge, or Playwright's Chromium:\n" +
      `  npx --prefix <scratch>/capture-deps playwright install chromium   (Linux: add --with-deps, needs root)`,
  );
}

// --check: the shot list, the dependencies and a browser, without opening the product.
if (values.check) {
  const { browser, channel } = await launch();
  await browser.close();
  console.log(
    (noShots ? `no shot list yet at ${shotsFile}\n` : `${spec.shots.length} shot(s) OK in ${shotsFile}\n`) +
      `ready: node ${process.version}, ${playwrightDep.name} ${playwrightDep.version}, sharp ${sharpDep.version}, browser ${channel}` +
      ([playwrightDep.version, sharpDep.version].includes("?") ||
      playwrightDep.version !== DEPS.playwright ||
      sharpDep.version !== DEPS.sharp
        ? `\nnote: tested with playwright ${DEPS.playwright} and sharp ${DEPS.sharp}; recapture one shot and look at it before trusting others`
        : ""),
  );
  process.exit(0);
}

// For a role selector that matches nothing: the names that role has on the page now, so a renamed
// label can be repaired from the output alone.
async function hints(page, selector) {
  const role = /^role=([a-z]+)/i.exec(selector)?.[1];
  if (!role) return "";
  const names = await page
    .getByRole(role)
    .evaluateAll((elements) =>
      elements
        .map((e) =>
          (e.getAttribute("aria-label") || e.labels?.[0]?.innerText || e.getAttribute("placeholder") || e.innerText || "")
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 60),
        )
        .filter(Boolean),
    )
    .catch(() => []);
  return names.length
    ? `; ${role} names on the page now: ${[...new Set(names)].slice(0, 12).map((n) => JSON.stringify(n)).join(", ")}`
    : `; no ${role} on the page now`;
}

// Exactly one element. A selector that starts matching several after a UI change would otherwise act
// on, or highlight, whichever comes first, and the shot would look fine while showing the wrong control.
async function one(page, selector, what, timeout = 10000) {
  const locator = page.locator(selector);
  try {
    await locator.first().waitFor({ state: "attached", timeout });
  } catch {
    throw new Error(`${what} "${selector}" matches nothing${await hints(page, selector)}`);
  }
  const count = await locator.count();
  if (count > 1)
    throw new Error(
      `${what} "${selector}" matches ${count} elements; make it specific, or add " >> nth=0" if the first is meant`,
    );
  return locator;
}

async function run(page, actions = []) {
  for (const action of actions) {
    const timeout = action.timeout ?? 15000;
    const target = async (selector, what) => one(page, selector, what, timeout);
    if (action.goto) await page.goto(new URL(action.goto, baseUrl).href);
    else if (action.click) await (await target(action.click, "click")).click({ timeout });
    else if (action.fill) await (await target(action.fill, "fill")).fill(action.value, { timeout });
    else if (action.press) await page.keyboard.press(action.press);
    else if (action.select) await (await target(action.select, "select")).selectOption(action.value, { timeout });
    else if (action.check) await (await target(action.check, "check")).check({ timeout });
    else if (action.hover) await (await target(action.hover, "hover")).hover({ timeout });
    else if (action.wait) await page.waitForTimeout(Number(action.wait));
    else if (action.waitFor) await (await target(action.waitFor, "waitFor")).waitFor({ timeout });
    else if (action.evaluate) await page.evaluate(action.evaluate);
  }
}

const marks = (shot) => {
  const items = (shot.highlight ?? []).map((h) => (typeof h === "string" ? { selector: h } : h));
  // Several unlabeled highlights are numbered in order; given labels (step numbers) are kept as written.
  const auto = items.length > 1 && items.every((h) => h.label === undefined);
  return items.map((h, i) => ({ ...h, label: auto ? String(i + 1) : h.label && String(h.label) }));
};

const visible = async (page, selector, what) => {
  const locator = await one(page, selector, what);
  await locator.scrollIntoViewIfNeeded({ timeout: 10000 }).catch(() => {
    throw new Error(`${what} "${selector}" is not visible`);
  });
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} "${selector}" is not visible`);
  return { locator, box };
};

/**
 * Captures the viewport, the full page, or the `clip` element plus `padding`, and measures each highlight
 * at the same scroll position, so fixed headers and dialogs line up. Returns the PNG and the boxes in
 * image pixels. Drawing happens on the image afterwards: nothing is added to the page, so a modal dialog,
 * a popover or an `overflow: hidden` parent can never cover a marker.
 */
async function shoot(page, shot, options, items) {
  const scale = spec.deviceScaleFactor ?? 1;
  let origin = { x: 0, y: 0 };
  let take;
  if (shot.clip) {
    const { locator: target, box } = await visible(page, shot.clip, "clip");
    const view = page.viewportSize();
    const pad = shot.padding ?? 16;
    // Labeled markers sit left of their control, so leave room for them on that side only.
    const left = shot.padding ?? (items.some((item) => item.label) ? 44 : 16);
    if (!view || box.height + 2 * pad > view.height) {
      // Taller than the viewport: the element alone, scrolled by Playwright.
      origin = box;
      take = () => target.screenshot(options);
    } else {
      const x = Math.max(0, box.x - left);
      const y = Math.max(0, box.y - pad);
      const clip = {
        x,
        y,
        width: Math.min(view.width, box.x + box.width + pad) - x,
        height: Math.min(view.height, box.y + box.height + pad) - y,
      };
      origin = clip;
      take = () => page.screenshot({ ...options, clip });
    }
  } else {
    if (items[0] && !shot.fullPage) await visible(page, items[0].selector, "highlight");
    if (shot.fullPage) {
      const [sx, sy] = await page.evaluate(() => [scrollX, scrollY]);
      origin = { x: -sx, y: -sy };
    }
    take = () => page.screenshot({ ...options, fullPage: !!shot.fullPage });
  }
  const boxes = [];
  for (const item of items) {
    const box = await (await one(page, item.selector, "highlight")).boundingBox();
    if (!box) throw new Error(`highlight "${item.selector}" is not visible`);
    boxes.push({
      label: item.label,
      x: (box.x - origin.x) * scale,
      y: (box.y - origin.y) * scale,
      width: box.width * scale,
      height: box.height * scale,
      selector: item.selector,
    });
  }
  return { png: await take(), boxes, scale };
}

// Frames and badges drawn as SVG over the screenshot. A badge sits outside its frame on the left,
// centered like a callout, so it never covers the control or the field label above it; without
// room there it moves onto the frame's left edge.
async function draw(png, boxes, scale) {
  if (!boxes.length) return png;
  const { width, height } = await sharp(png).metadata();
  const s = (n) => Math.round(n * scale * 10) / 10;
  const parts = [];
  for (const b of boxes) {
    if (b.x + b.width < 0 || b.y + b.height < 0 || b.x > width || b.y > height)
      throw new Error(`highlight "${b.selector}" is outside the captured area`);
    const [x, y, w, h] = [b.x - s(3), b.y - s(3), b.width + s(6), b.height + s(6)];
    parts.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${s(7)}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="${s(6)}"/>`,
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${s(7)}" fill="none" stroke="${color}" stroke-width="${s(2.5)}"/>`,
    );
    if (b.label) {
      const r = s(b.label.length > 1 ? 14 : 12);
      const outside = x - s(6) - r;
      const cx = outside - r >= 0 ? outside : Math.min(Math.max(x, r + 1), width - r - 1);
      const cy = Math.min(Math.max(y + h / 2, r + 1), height - r - 1);
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#fff" stroke-width="${s(2)}"/>`,
        `<text x="${cx}" y="${cy}" dy=".35em" text-anchor="middle" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-weight="700" font-size="${s(13)}" fill="#fff">${b.label}</text>`,
      );
    }
  }
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`,
  );
  return sharp(png).composite([{ input: svg }]).png().toBuffer();
}

// A pixel counts as changed past this grey-level difference (encoding noise stays under it), and the
// picture counts as changed when more than SAME of its pixels did: one renamed label is enough.
// ponytail: thresholds from testing on simplink's UI; make them shot-list keys if a product needs others.
const PIXEL = 32;
const SAME = 0.0005;

/**
 * The share of pixels that visibly changed between the image on disk and the new one, compared in
 * grey at 256 px wide; 1 when the crop changed shape. null when there is no previous image.
 */
async function difference(out, data) {
  if (!existsSync(out)) return null;
  try {
    const old = readFileSync(out);
    const [a, b] = await Promise.all([sharp(old).metadata(), sharp(data).metadata()]);
    if (Math.abs(a.width / a.height - b.width / b.height) > 0.02) return 1;
    const height = Math.max(1, Math.round((256 * b.height) / b.width));
    const grey = (input) => sharp(input).resize(256, height, { fit: "fill" }).greyscale().raw().toBuffer();
    const [x, y] = await Promise.all([grey(old), grey(data)]);
    let count = 0;
    for (let i = 0; i < x.length; i++) if (Math.abs(x[i] - y[i]) > PIXEL) count++;
    return count / x.length;
  } catch {
    return 1;
  }
}

async function compress(png, out) {
  let image = sharp(png);
  const { width } = await image.metadata();
  if (width > maxWidth) image = image.resize({ width: maxWidth });
  const ext = path.extname(out).toLowerCase();
  if (ext === ".webp") return image.webp({ quality, effort: 6 }).toBuffer();
  if (ext === ".png") return image.png({ palette: true, quality, compressionLevel: 9, effort: 10 }).toBuffer();
  return image.jpeg({ quality, mozjpeg: true }).toBuffer();
}

const wanted = (shot) => !values.only || shot.out === values.only || shot.node === values.only;
const shots = spec.shots.filter(wanted);
if (!shots.length) fail(`No shot matches --only ${values.only}`);
const { browser } = await launch();
let failed = 0;
const changed = [];
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: spec.deviceScaleFactor ?? 1,
    locale: spec.locale,
    timezoneId: spec.timezoneId,
    colorScheme: spec.colorScheme ?? "light",
    reducedMotion: "reduce",
    ...(values["storage-state"] ? { storageState: values["storage-state"] } : {}),
  });
  const page = await context.newPage();
  if (spec.setup) {
    await page.goto(new URL(spec.setupUrl ?? "/", baseUrl).href);
    await run(page, spec.setup);
  }
  for (const shot of shots) {
    try {
      await page.goto(new URL(shot.url, baseUrl).href, { waitUntil: "networkidle" });
      await run(page, shot.actions);
      const options = {
        animations: "disabled",
        caret: "hide",
        mask: (shot.mask ?? []).map((selector) => page.locator(selector)),
        maskColor: "#d4d4d8",
      };
      const { png, boxes, scale } = await shoot(page, shot, options, marks(shot));
      const out = path.resolve(kb, shot.out);
      mkdirSync(path.dirname(out), { recursive: true });
      const data = await compress(await draw(png, boxes, scale), out);
      const diff = await difference(out, data);
      const kbSize = Math.round(data.length / 1024);
      const size = data.length > budget ? ` (over ${budget / 1024} KB: crop with "clip" or lower "quality")` : "";
      if (diff !== null && diff < SAME) {
        // Re-encoding noise only: keep the file, so an unchanged screen makes no Git change.
        console.log(`same ${shot.out}`);
        continue;
      }
      writeFileSync(out, data);
      if (diff === null) console.log(`${size ? "WARN" : "new "} ${shot.out} ${kbSize} KB${size}`);
      else {
        changed.push(shot);
        const how = diff === 1 ? "layout changed" : `${(diff * 100).toFixed(1)}% of pixels`;
        console.log(`CHANGED ${shot.out} (${how}) ${kbSize} KB${size}`);
      }
    } catch (error) {
      failed++;
      console.error(`FAIL ${shot.out}: ${error.message.split("\n")[0]} (previous image kept)`);
    }
  }
} finally {
  await browser.close();
}
const missingRefs = shots.filter((shot) => {
  if (!shot.node) return false;
  const [type, ...segs] = shot.node.split(".");
  const file = path.join(kb, { procedure: "procedures", state: "states", capability: "capabilities" }[type], ...segs) + ".md";
  return existsSync(file) && !readFileSync(file, "utf8").includes(path.basename(shot.out));
});
for (const shot of missingRefs) console.error(`UNLINKED ${shot.out}: ${shot.node} does not reference it yet`);
for (const shot of changed)
  console.error(
    `REVIEW ${shot.node ? `${shot.node}: ` : ""}${shot.out} changed; open it, then fix its alt text and the steps it covers if the screen differs`,
  );
console.log(`${shots.length - failed}/${shots.length} captured into ${path.relative(process.cwd(), kb) || "."}`);
process.exit(failed ? 1 : 0);


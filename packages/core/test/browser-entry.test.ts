import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { builtinModules } from "node:module";
import { compileValidator, createValidator, loadDocs } from "../src/index.js";

test("browser entry has no reachable core Node imports after browser mapping", async () => {
  const seen = new Set<string>();
  async function walk(url: URL): Promise<void> {
    if (url.pathname.endsWith("/platform.js"))
      url = new URL("./platform-browser.js", url);
    if (seen.has(url.href)) return;
    seen.add(url.href);
    const source = await readFile(url, "utf8");
    for (const [, specifier] of source.matchAll(
      /(?:from\s*|import\s*\()["']([^"']+)["']/g,
    )) {
      assert.ok(
        !specifier.startsWith("node:") && !builtinModules.includes(specifier),
        specifier,
      );
      if (specifier.startsWith(".")) await walk(new URL(specifier, url));
    }
  }
  await walk(new URL("../dist/browser.js", import.meta.url));
  assert.ok(seen.size > 10);
});

test("supplied schemas validate fixture frontmatter identically to bundled schemas", async () => {
  const dir = new URL("../schemas/", import.meta.url);
  const schemas = await Promise.all(
    (await readdir(dir))
      .filter((name) => name.endsWith(".schema.json"))
      .map(async (name) =>
        JSON.parse(await readFile(new URL(name, dir), "utf8")),
      ),
  );
  const supplied = compileValidator(schemas);
  const bundled = createValidator();
  const docs = await loadDocs(
    new URL("../../../test/fixtures/kb/", import.meta.url).pathname.replace(
      /^\/([A-Z]:)/i,
      "$1",
    ),
  );
  for (const doc of docs)
    if (doc.folderType)
      assert.deepEqual(
        supplied(doc.folderType, doc.data),
        bundled(doc.folderType, doc.data),
      );
  assert.ok(supplied("goal", {}).length > 0);
});

import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { SourceFiles } from "../src/components/source-files.js";

test("sources render as individual files and only HTTP URLs become links", () => {
  const html = renderToStaticMarkup(
    createElement(SourceFiles, {
      sources: [
        "src/send.ts",
        "docs/guide.md",
        "https://example.org/guide",
        "javascript:alert(1)",
      ],
    }),
  );
  assert.equal((html.match(/<li\b/g) ?? []).length, 4);
  assert(html.includes("src/send.ts"));
  assert(html.includes("docs/guide.md"));
  assert(html.includes('href="https://example.org/guide"'));
  assert(!html.includes('href="javascript:'));
  assert(!html.includes("[&quot;"));
});

test("empty sources show an explicit empty state", () => {
  const html = renderToStaticMarkup(
    createElement(SourceFiles, { sources: [] }),
  );
  assert(html.includes("None"));
});

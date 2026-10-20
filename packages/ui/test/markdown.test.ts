import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { docHref, Markdown } from "../web/src/components/markdown.js";
test("docs links resolve relative paths and preserve layout and fragments", () => {
  assert.equal(
    docHref("../features/send.md#limits", "guides/how-to/start.md", "graph"),
    "/docs/guides/features/send.md?layout=graph#limits",
  );
  assert.equal(
    docHref("https://example.org/a.md", "guides/start.md", "site"),
    "https://example.org/a.md",
  );
  assert.equal(docHref("#steps", "guides/start.md", "site"), "#steps");
});
test("Markdown links wikilinks, retains literal code, and anchors headings", () => {
  const html = renderToStaticMarkup(
    createElement(Markdown, {
      content: "## Steps here\n\n[[procedure.send|Send]] and `[[literal]]`",
    }),
  );
  assert.match(html, /id="steps-here"/);
  assert.match(html, /href="\/nodes\/procedure.send"/);
  assert.match(html, /<code>\[\[literal\]\]<\/code>/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  docHref,
  Markdown,
  stripFrontmatter,
} from "../src/components/markdown.js";

test("documentation previews hide frontmatter and preserve Markdown separators", () => {
  assert.equal(
    stripFrontmatter("---\r\ntitle: Page\r\n---\r\n# Page\r\n\r\n---\r\nBody"),
    "# Page\r\n\r\n---\r\nBody",
  );
  assert.equal(stripFrontmatter("# Page\n\n---\nBody"), "# Page\n\n---\nBody");
});
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
    createElement(RouterContextProvider, {
      router: createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory(),
      }),
      children: createElement(Markdown, {
        content: "## Steps here\n\n[[procedure.send|Send]] and `[[literal]]`",
      }),
    }),
  );
  assert.match(html, /id="steps-here"/);
  assert.match(html, /href="\/nodes\/procedure.send"/);
  assert.match(html, /<code>\[\[literal\]\]<\/code>/);
});
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterContextProvider,
} from "@tanstack/react-router";

test("rendered Markdown hrefs include the router base for cross-page and node links", () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({
      initialEntries: ["/sub/docs/guides/start.md"],
    }),
    basepath: "/sub/",
  });
  const html = renderToStaticMarkup(
    createElement(RouterContextProvider, {
      router,
      children: createElement(Markdown, {
        path: "guides/start.md",
        layout: "graph",
        content:
          "[Other](../reference/rules.md#limits) [Here](#steps) [[goal.send]]",
      }),
    }),
  );
  assert.match(
    html,
    /href="\/sub\/docs\/reference\/rules.md\?layout=graph#limits"/,
  );
  assert.match(html, /href="#steps"/);
  assert.match(html, /href="\/sub\/nodes\/goal.send"/);
});

test("external and malformed Markdown links never become workspace routes or crash rendering", () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory(),
    basepath: "/sub/",
  });
  const html = renderToStaticMarkup(
    createElement(RouterContextProvider, {
      router,
      children: createElement(Markdown, {
        content: "[External](//example.org/help) [Broken](http://[)",
      }),
    }),
  );
  assert.match(html, /href="\/\/example.org\/help"/);
  assert.match(html, /href="http:\/\/%5B"/);
});

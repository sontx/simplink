import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FrontmatterValue } from "../src/components/frontmatter-value.js";

const render = (value: unknown) =>
  renderToStaticMarkup(createElement(FrontmatterValue, { value }));
// Visible text only, so class names never satisfy an assertion.
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

test("frontmatter maps render as labelled rows instead of JSON", () => {
  const html = render({ path: "guides/send.md", order: 10 });
  assert.doesNotMatch(text(html), /[{}"]/);
  assert.match(html, /<dt[^>]*>Path<\/dt>/);
  assert.match(html, /guides\/send\.md/);
  assert.match(html, /<dt[^>]*>Order<\/dt>/);
});

test("frontmatter lists put one entry per item, including nested objects", () => {
  const html = render([
    { id: "recipient", options: [{ key: "uid" }, { key: "phone" }] },
  ]);
  assert.doesNotMatch(text(html), /[[\]{}"]/);
  assert.equal(html.match(/<li/g)?.length, 3);
  assert.match(html, /<dt[^>]*>Options<\/dt>/);
});

test("frontmatter empty values say so", () => {
  assert.match(render([]), />None</);
  assert.match(render({}), />None</);
  assert.match(render(null), />—</);
});

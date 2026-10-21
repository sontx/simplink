import assert from "node:assert/strict";
import test from "node:test";
import {
  completeFrontmatter,
  getFrontmatter,
  validateFrontmatter,
} from "../src/lib/frontmatter.js";

const valid =
  "---\ntype: procedure\ntitle: Send\nsummary: Send a message\n---\n# Body\n";

test("frontmatter boundaries preserve offsets and exclude Markdown, including CRLF", () => {
  const raw = valid.replace(/\n/g, "\r\n");
  const block = getFrontmatter(raw)!;
  assert.equal(block.start, 5);
  assert.equal(raw.slice(block.start, block.end), block.yaml);
  assert(!block.yaml.includes("# Body"));
  assert.deepEqual(validateFrontmatter(raw, "procedure"), []);
  assert.equal(getFrontmatter("# Body\n\n---\ntitle: Later\n---"), null);
  assert.deepEqual(
    completeFrontmatter(valid, valid.indexOf("# Body"), "procedure"),
    [],
  );
});

test("validation uses the node schema, including required, nested, and unevaluated fields", () => {
  const raw = valid.replace(
    "summary: Send a message",
    "summary: 42\nextra: true\ndocs:\n  order: -1",
  );
  const diagnostics = validateFrontmatter(raw, "procedure");
  assert(
    diagnostics.some(
      (d) => raw.slice(d.start, d.end) === "42" && d.message.includes("string"),
    ),
  );
  assert(diagnostics.some((d) => raw.slice(d.start, d.end) === "extra"));
  assert(diagnostics.some((d) => raw.slice(d.start, d.end) === "-1"));
  assert(
    validateFrontmatter(valid, "goal").some((d) =>
      d.message.includes("procedures"),
    ),
  );
  assert(
    validateFrontmatter(valid, "goal").some((d) =>
      d.message.includes("constant"),
    ),
  );
});

test("YAML errors, duplicate keys, missing delimiters, and unsafe aliases produce diagnostics", () => {
  for (const raw of [
    "---\ntitle: [broken\n---\n# Body",
    "---\ntitle: One\ntitle: Two\n---",
    "---\ntitle: *unknown\n---",
    "---\ntitle: One",
    "# No frontmatter",
  ])
    assert(validateFrontmatter(raw, "procedure").length > 0, raw);
});

function suggestions(source: string, type = "procedure") {
  const offset = source.indexOf("|");
  const raw = source.replace("|", "");
  return { raw, items: completeFrontmatter(raw, offset, type) };
}

test("completion suggests schema fields without duplicating existing keys", () => {
  const { items } = suggestions("---\ntitle: Existing\nsta|\n---");
  assert(
    items.some(
      (item) => item.label === "status" && item.insertText === "status: ",
    ),
  );
  assert(items.some((item) => item.label === "uses"));
  assert(!items.some((item) => item.label === "title"));
  const existing = suggestions("---\nsta|tus: active\n---");
  const status = existing.items.find((item) => item.label === "status")!;
  assert.equal(existing.raw.slice(status.start, status.end), "status");
  assert.equal(status.insertText, "status");
});

test("completion replaces enum values and selects the schema from the actual node type", () => {
  const { raw, items } = suggestions(
    "---\nseverity: war|ning\n---",
    "constraint",
  );
  const warning = items.find((item) => item.label === "warning")!;
  assert.equal(raw.slice(warning.start, warning.end), "warning");
  assert(items.some((item) => item.label === "blocking"));
  const type = suggestions("---\ntype: |\n---", "procedure");
  assert.deepEqual(
    type.items.map((item) => item.label),
    ["procedure"],
  );
});

test("completion follows schema references through nested maps and object arrays", () => {
  assert(
    suggestions("---\ndocs:\n  pa|\n---").items.some(
      (item) => item.label === "path",
    ),
  );
  assert(
    !suggestions("---\ndocs:\n  pa|\n---").items.some(
      (item) => item.label === "title",
    ),
  );
  assert(
    suggestions("---\nchoices:\n  - id: route\n    qu|\n---").items.some(
      (item) => item.label === "question",
    ),
  );
  assert(
    suggestions("---\nchoices:\n  - options:\n      - ke|\n---").items.some(
      (item) => item.label === "key",
    ),
  );
  assert(
    suggestions("---\navailability:\n  |\n---").items.some(
      (item) => item.label === "plans",
    ),
  );
});

test("completion leaves comments and Markdown code fences alone", () => {
  for (const source of [
    "---\n# sta|\n---",
    "---\ntitle: Example # sta|\n---",
    "---\ntitle: >\n  sta|\n---",
    "---\ntype: procedure\n---\n```yaml\nsta|\n```",
  ])
    assert.deepEqual(suggestions(source).items, [], source);
});

test("each bundled node schema validates its own required fields and enums", () => {
  const common = "title: Example\nsummary: Example summary\n";
  const bodies = {
    goal: "when_to_use: [Example]\nprocedures: [procedure.example]\n",
    procedure: "uses: [capability.example]\n",
    capability: "requires: [capability.example]\n",
    state: "check: Example\nsatisfied_by: [procedure.example]\n",
    constraint: "severity: blocking\n",
  };
  for (const type of Object.keys(bodies) as (keyof typeof bodies)[]) {
    const raw = `---\ntype: ${type}\n${common}${bodies[type]}---\n# Body`;
    assert.deepEqual(validateFrontmatter(raw, type), [], type);
  }
  const invalid = "---\ntype: constraint\n" + common + "severity: invalid\n---";
  assert(
    validateFrontmatter(invalid, "constraint").some((item) =>
      item.message.includes("allowed values"),
    ),
  );
});

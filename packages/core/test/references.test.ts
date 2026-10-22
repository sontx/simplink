import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, goal, proc } from "./helpers.js";
import {
  parseRef,
  formatRef,
  qualify,
  localize,
  idToPath,
  deriveId,
  parseSimpUri,
  extractBodyLinks,
  createKB,
  memorySource,
} from "../src/index.js";
const simp = (peers = "[{name: crm}]") =>
  `---\ntype: simp\nname: zalo-oa\ntitle: Zalo\nsummary: Home\npeers: ${peers}\n---\n`;
test("parses simp URIs and qualified references", () => {
  for (const [uri, expected] of [
    ["simp://crm/goal.x", { ref: "crm:goal.x" }],
    ["simp://crm/goal.x#steps", { ref: "crm:goal.x", fragment: "steps" }],
    ["simp://crm", { ref: "crm:simp" }],
    ["simp:///goal.x", { ref: "goal.x" }],
    ["https://x", undefined],
  ] as const)
    assert.deepEqual(parseSimpUri(uri), expected);
  assert.deepEqual(parseRef("crm:goal.x"), { simp: "crm", id: "goal.x" });
  assert.equal(formatRef(parseRef("goal.x")), "goal.x");
  assert.equal(qualify("crm:goal.x", "own"), "crm:goal.x");
  assert.equal(localize("own:goal.x", "own"), "goal.x");
});
test("simp links and qualified wikilinks become related body edges", async () => {
  const body =
    "[[crm:goal.a]] [t](simp://crm/state.b) [t](simp:///goal.local) `[[crm:goal.ignored]]` [[crm:goal.a]]";
  const { graph } = await fixture({
    "simp.md": simp(),
    "procedures/a.md": proc("A") + body,
  });
  assert.deepEqual(
    graph.edges.filter((e) => e.source === "body").map((e) => e.to),
    ["crm:goal.a", "crm:state.b", "goal.local"],
  );
  assert.equal(graph.in.get("crm:state.b")?.[0].from, "procedure.a");
  assert.deepEqual(extractBodyLinks("```\n[t](simp://crm/goal.x)\n```"), []);
});
test("qualified frontmatter refs pass schema, but wrong types fail", async () => {
  const r = await fixture({
    "simp.md": simp(),
    "goals/a.md": goal(["crm:procedure.y"]),
    "procedures/a.md": proc("A", "preconditions: [crm:state.x]\n"),
  });
  assert.ok(!r.issues.some((i) => i.code === "E008" || i.code === "E007"));
  const wrong = await fixture({
    "simp.md": simp(),
    "goals/a.md": goal(["crm:state.x"]),
  });
  assert.ok(wrong.issues.some((i) => i.code === "E008"));
});
test("undeclared simp prefix is E016 with or without simp.md", async () => {
  for (const manifest of [true, false]) {
    const r = await fixture({
      ...(manifest ? { "simp.md": simp() } : {}),
      "procedures/a.md": proc("A", "preconditions: [billing:state.x]\n"),
    });
    assert.ok(
      r.issues.some(
        (i) =>
          i.code === "E016" && i.message.includes('unknown simp "billing"'),
      ),
    );
  }
});
test("own-name refs normalize to local ids", async () => {
  const r = await fixture({
    "simp.md": simp(),
    "procedures/a.md":
      proc("A", "requires: [zalo-oa:procedure.b]\n") +
      "[B](simp://zalo-oa/procedure.b)",
    "procedures/b.md": proc("B"),
  });
  assert.deepEqual(r.graph.nodes.get("procedure.a")?.data.requires, [
    "procedure.b",
  ]);
  assert.ok(r.graph.edges.every((e) => e.to === "procedure.b"));
  assert.ok(!r.issues.some((i) => ["E007", "E016"].includes(i.code)));
});
test("idToPath inverts deriveId and rejects unsafe ids", () => {
  for (const id of ["goal.a", "procedure.a.b", "simp"])
    assert.equal(deriveId(idToPath(id)!).derivedId, id);
  for (const id of ["procedure.../x", "goal.A", "crm:goal.a", "goal.%2e%2e"])
    assert.equal(idToPath(id), undefined);
});
test("docs render remote links with labels, URLs, and the remote hook", async () => {
  const files = {
    "simp.md": simp(),
    "procedures/a.md":
      proc("A") +
      "[CRM import](simp://crm/goal.import#steps) [[crm:goal.import|CRM import]] [CRM](simp://crm)",
  };
  const kb = await createKB(memorySource(files));
  assert.match(
    kb
      .docs()
      .map((p) => p.content)
      .join(""),
    /CRM import \(crm\)/,
  );
  assert.match(
    kb
      .docs({
        remoteLink: (ref, label, fragment) =>
          `[${label}](https://d/${ref}#${fragment})`,
      })
      .map((p) => p.content)
      .join(""),
    /\[CRM import\]\(https:\/\/d\/crm:goal.import#steps\)/,
  );
  files["simp.md"] = simp("[{name: crm, docs_url: https://docs.example/crm/}]");
  const linked = await createKB(memorySource(files));
  const text = linked
    .docs()
    .map((p) => p.content)
    .join("");
  assert.match(
    text,
    /\[CRM import\]\(https:\/\/docs.example\/crm\/goals\/import.md#steps\)/,
  );
  assert.match(
    text,
    /\[CRM import\]\(https:\/\/docs.example\/crm\/goals\/import.md\)/,
  );
  assert.match(text, /\[CRM\]\(https:\/\/docs.example\/crm\/\)/);
});

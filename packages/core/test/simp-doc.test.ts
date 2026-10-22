import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, goal, proc } from "./helpers.js";
import { exportDocs, simpDoc } from "../src/index.js";
const simp = (extra = "", body = "Welcome here.") =>
  `---\ntype: simp\nname: zalo-oa\ntitle: Zalo OA\nsummary: Product home\n${extra}---\n${body}`;
test("loads root simp.md as the simp node", async () => {
  const result = await fixture({
    "simp.md": simp(),
    "goals/a.md": goal(["procedure.a"]),
    "procedures/a.md": proc("A"),
  });
  assert.equal(result.graph.nodes.get("simp")?.type, "simp");
  assert.equal(result.errorCount, 0);
  assert.equal(simpDoc(result.graph)?.name, "zalo-oa");
  assert.deepEqual(simpDoc(result.graph)?.serves, ["pull"]);
  assert.ok(
    !result.issues.some((i) => i.code === "W101" && i.path === "simp.md"),
  );
});
test("rejects a root simp.md with another type", async () => {
  const r = await fixture({ "simp.md": goal(["procedure.a"]) });
  assert.ok(r.issues.some((i) => i.code === "E003" && i.path === "simp.md"));
});
test("still drops other root-level files", async () => {
  const r = await fixture({ "README.md": "Read me" });
  assert.equal(r.graph.nodes.size, 0);
  assert.deepEqual(r.issues, []);
});
test("validates simp.md fields", async () => {
  for (const [content, code] of [
    [simp().replace("zalo-oa", "Bad_Name"), "E008"],
    [simp("foo: 1\n"), "E005"],
    [simp("peers: [{name: zalo-oa}]\n"), "E012"],
    [simp("serves: []\n"), "E006"],
    [simp("peers: [{name: crm}, {name: crm}]\n"), "E012"],
  ]) {
    const r = await fixture({ "simp.md": content });
    assert.ok(
      r.issues.some((i) => i.code === code),
      JSON.stringify(r.issues),
    );
  }
});
test("site docs use simp.md as the root index", async () => {
  const { graph } = await fixture({
    "simp.md": simp(),
    "procedures/a.md": proc("A"),
  });
  const pages = exportDocs(graph);
  const home = pages.filter((p) => p.path === "index.md");
  assert.equal(home.length, 1);
  assert.match(home[0].content, /# Zalo OA/);
  assert.match(home[0].content, /Welcome here/);
  assert.match(home[0].content, /\[Guides\]/);
  assert.ok(!pages.some((p) => p.path === "simp.md"));
});

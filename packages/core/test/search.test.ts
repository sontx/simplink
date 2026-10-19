import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearchIndex, fold, lintKB } from "../src/index.js";
import { fixture, goal, proc } from "./helpers.js";

const sample = async () => {
  const r = await lintKB(fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)));
  assert.equal(r.errorCount, 0);
  return createSearchIndex(r.graph);
};

test("fold normalizes case, combining marks, and stroked d characters", () => {
  assert.equal(fold("Đăng ký mẫu tin Gửi HÀNG LOẠT"), "dang ky mau tin gui hang loat");
});

test("queries with and without diacritics produce the same ranking", async () => {
  const s = await sample();
  const a = s.search("gửi tin nhắn hàng loạt");
  const b = s.search("gui tin nhan hang loat");
  assert.equal(a.goals[0].id, "goal.send-zalo-broadcast");
  assert.deepEqual(a.hits.map((h) => h.id), b.hits.map((h) => h.id));
});

test("aliases outrank body matches", async () => {
  const r = (await sample()).search("nhắn tin cho khách");
  assert.equal(r.hits[0].id, "goal.send-zalo-message");
  assert.ok(r.hits[0].matched.khach?.includes("aliases"));
});

test("typo tolerance on long terms, none on short terms", async () => {
  const s = await sample();
  assert.ok(s.search("brodcast").hits.some((h) => h.id === "goal.send-zalo-broadcast"));
  // Short terms such as "dang" must not fuzzy-match "hang".
  assert.deepEqual(s.search("dang ky mau").hits.map((h) => h.id), ["procedure.zalo.register-template"]);
});

test("prefix on last term", async () => {
  assert.equal((await sample()).search("sched").hits[0].id, "capability.broadcast.schedule");
});

test("stopwords are ignored", async () => {
  const s = await sample();
  assert.deepEqual(s.search("how do I connect zalo").hits.map((h) => h.id), s.search("connect zalo").hits.map((h) => h.id));
  assert.deepEqual(s.search("how do I").hits, []);
});

test("non-goal hit surfaces its goal through choices and preconditions", async () => {
  const r = (await sample()).search("template approved");
  assert.equal(r.hits[0].id, "state.zalo.template-approved");
  assert.deepEqual(r.hits[0].goals, ["goal.send-zalo-message"]);
  const g = r.goals.find((x) => x.id === "goal.send-zalo-message")!;
  // state ← deliver-by-phone (preconditions) ← send-message (choice_option) ← goal (procedures)
  assert.ok(g.via.some((v) => v.id === "state.zalo.template-approved" && v.hops === 3));
  assert.ok(g.relevance < 1 && g.relevance > 0);
});

test("fix procedures (satisfied_by only) do not surface goals", async () => {
  const r = (await sample()).search("connect zalo oa");
  assert.equal(r.hits[0].id, "procedure.channel.connect-zalo");
  assert.deepEqual(r.hits[0].goals, []);
});

test("type filter limits hits but goals still aggregate from all hits", async () => {
  const r = (await sample()).search("template approved", { types: ["procedure"] });
  assert.ok(r.hits.every((h) => h.type === "procedure"));
  assert.equal(r.goals[0]?.id, "goal.send-zalo-message");
});

test("deprecated nodes excluded by default", async () => {
  const { graph } = await fixture({
    "goals/g.md": goal(["procedure.old", "procedure.new"]),
    "procedures/old.md": proc("legacy export", "status: deprecated\n"),
    "procedures/new.md": proc("modern export"),
  });
  const s = createSearchIndex(graph);
  assert.deepEqual(s.search("export").hits.map((h) => h.id), ["procedure.new"]);
  assert.ok(s.search("export", { includeDeprecated: true }).hits.some((h) => h.id === "procedure.old"));
});

test("empty and no-match queries", async () => {
  const s = await sample();
  assert.deepEqual(s.search("   "), { query: "   ", hits: [], goals: [] });
  assert.deepEqual(s.search("xyzzyqq").hits, []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createKBTools, type KBTools } from "../src/index.js";

let cached: KBTools | undefined;
const tools = async () => (cached ??= await createKBTools(path.resolve("kb")));
const call = async (name: string, args: unknown) => (await tools()).call(name, args);
const parse = (r: { content: string }) => JSON.parse(r.content);

test("definitions: 5 read-only tools with object schemas", async () => {
  const t = await tools();
  assert.deepEqual(t.definitions.map((d) => d.name), ["search_kb", "resolve_goal", "resolve_procedure", "get_node", "get_related"]);
  for (const d of t.definitions) {
    assert.equal(d.inputSchema.type, "object");
    assert.equal(d.annotations?.readOnlyHint, true);
  }
  assert.equal(t.status.errors, 0);
});

test("search_kb → compact JSON with goals first, empty arrays dropped", async () => {
  const r = await call("search_kb", { query: "gửi tin nhắn hàng loạt", limit: 3 });
  assert.ok(!r.isError);
  const j = parse(r);
  assert.equal(j.goals[0].id, "goal.send-zalo-broadcast");
  assert.ok(j.hits.length <= 3);
  assert.equal(j.hits[0].goals, undefined); // goal hit: empty goals array dropped
  assert.ok(!r.content.includes("\n")); // compact
});

test("resolve_goal → Markdown plan honoring states, plan and choices", async () => {
  const r = await call("resolve_goal", {
    goal_id: "goal.send-zalo-message",
    states: { "state.channel.zalo-connected": true },
    plan: "pro",
    choices: { recipient: "uid" },
  });
  assert.ok(!r.isError);
  assert.match(r.content, /^# Goal: Send a Zalo message/);
  assert.match(r.content, /\(selected: uid\)/);
  assert.doesNotMatch(r.content, /CHECK\*\* `state.channel.zalo-connected`/);
});

test("resolve_procedure → standalone procedure plan", async () => {
  const r = await call("resolve_procedure", { procedure_id: "procedure.zalo.register-template" });
  assert.match(r.content, /^# Procedure: Register message template/);
  assert.match(r.content, /## Plan:/);
});

test("wrong type → error with the right tool hint", async () => {
  const r = await call("resolve_goal", { goal_id: "procedure.channel.connect-zalo" });
  assert.equal(r.isError, true);
  assert.match(r.content, /is a procedure, not a goal\. Use resolve_procedure/);
});

test("unknown id → error with suggestions", async () => {
  const r = await call("resolve_goal", { goal_id: "goal.send-zalo-msg" });
  assert.equal(r.isError, true);
  assert.match(r.content, /Did you mean: .*goal\.send-zalo-message/);
});

test("invalid arguments → validation error, no throw", async () => {
  const r = await call("search_kb", { query: "", limit: 99, extra: 1 });
  assert.equal(r.isError, true);
  assert.match(r.content, /Invalid arguments for search_kb/);
  assert.match(r.content, /limit must be <= 25/);
  assert.match(r.content, /additional properties/);
  assert.equal((await call("nope", {})).isError, true);
});

test("get_node → fields, edges both ways, truncated body", async () => {
  const j = parse(await call("get_node", { id: "procedure.zalo.send-message", max_body_chars: 20 }));
  assert.equal(j.fields.choices[0].id, "recipient");
  assert.deepEqual(j.out.choice_option, ["procedure.zalo.deliver-by-uid", "procedure.zalo.deliver-by-phone"]);
  assert.deepEqual(j.in.procedures, ["goal.send-zalo-message"]);
  assert.equal(j.body.length, 20);
  assert.equal(j.body_truncated, true);
  assert.equal(parse(await call("get_node", { id: "state.zalo.template-approved", max_body_chars: 0 })).body, undefined);
});

test("get_related → BFS with direction, kinds, and limit", async () => {
  const inbound = parse(await call("get_related", { id: "state.zalo.template-approved", direction: "in", depth: 3 }));
  const byId = Object.fromEntries(inbound.nodes.map((n: any) => [n.id, n.distance]));
  assert.equal(byId["procedure.zalo.deliver-by-phone"], 1);
  assert.equal(byId["goal.send-zalo-message"], 3);
  assert.ok(inbound.edges.some((e: string[]) => e.join() === "procedure.zalo.deliver-by-phone,preconditions,state.zalo.template-approved"));

  const onlyUses = parse(await call("get_related", { id: "procedure.broadcast.send-zalo", direction: "out", depth: 1, kinds: ["uses"] }));
  assert.ok(onlyUses.edges.every((e: string[]) => e[1] === "uses"));

  const limited = parse(await call("get_related", { id: "goal.send-zalo-message", depth: 3, limit: 3 }));
  assert.equal(limited.nodes.length, 3);
  assert.equal(limited.truncated, true);
});

test("KB with lint errors still serves, with a warning prefix", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "simp-"));
  await mkdir(path.join(dir, "goals"), { recursive: true });
  await writeFile(path.join(dir, "goals/g.md"), "---\ntype: goal\ntitle: Export data\nsummary: x\n---\n");
  const t = await createKBTools(dir);
  assert.ok(t.status.errors > 0);
  const r = t.call("search_kb", { query: "export" });
  assert.match(r.content, /^\[KB has \d+ lint error\(s\)/);
});

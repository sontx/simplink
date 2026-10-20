import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/index.js";
import { goal, proc } from "./helpers.js";

const files = { "procedures/a.md": proc("Export"), "goals/g.md": goal(["procedure.a"]) };

test("sources share filtering, ordering, parsing and path validation", async () => {
  assert.equal(typeof core.memorySource, "function");
  const source = core.memorySource({ ...files, "index.md": "ignored", ".hidden/a.md": "ignored", "procedures/a.txt": "ignored" });
  assert.equal(source.name, "<memory>");
  assert.deepEqual((await core.loadDocs(source)).map(d => d.relPath), ["goals/g.md", "procedures/a.md"]);
  assert.deepEqual(await core.loadDocs({ async list() { return source.list(); } }), await core.loadDocs(source));
  for (const relPath of ["/a.md", "C:/a.md", "a\\b.md", "a//b.md", "a/../b.md", "./a.md", ""]) {
    await assert.rejects(core.loadDocs({ list: () => [{ relPath, content: "" }] }), /path/i);
  }
  await assert.rejects(core.loadDocs({ list: () => [{ relPath: "a/b.md", content: "" }, { relPath: "a/b.md", content: "" }] }), /duplicate/i);
  assert.ok(core.parseDoc("procedures/a.md", "---\ntitle: [\n---").parseError);
});

test("lint awaits replacement validators and ordered rules while retaining structure", async () => {
  const calls: string[] = [];
  const result = await core.lintKB(core.memorySource({ "procedures/a.md": "---\ntype: wrong\nid: bad\n---" }), {
    validator: async () => [],
    rules: [async () => { calls.push("first"); return [{ code: "W999", severity: "warning", path: "x", message: "custom" }]; }, () => { calls.push("second"); return []; }],
    disable: ["W999"],
  });
  assert.deepEqual(calls, ["first", "second"]);
  assert.ok(result.issues.some(i => i.code === "E003"));
  assert.ok(result.issues.some(i => i.code === "E002"));
  assert.ok(!result.issues.some(i => i.code === "W999" || i.code === "E006"));
  assert.equal(result.errorCount + result.warningCount, result.issues.length);
  await assert.rejects(core.lintKB({ list() { throw Error("loaded"); } }, { disable: ["E003"] }), /disable.*E003/i);
  await assert.rejects(core.lintKB(core.memorySource(files), { validator: async () => { throw Error("validator failed"); } }), /validator failed/);
  await assert.rejects(core.lintKB(core.memorySource(files), { rules: [async () => { throw Error("rule failed"); }] }), /rule failed/);
});

test("async retrieval normalizes scores and surfaces goals before type limits", async () => {
  const { graph } = await core.lintKB(core.memorySource(files));
  let called = 0;
  const search = core.createKBSearch(graph, { async search(query, opts) {
    called++;
    assert.equal("types" in opts, false);
    assert.equal("limit" in opts, false);
    return [
      { id: "procedure.a", score: 1 }, { id: "missing", score: 999 },
      { id: "procedure.a", score: 10 }, { id: "goal.g", score: 2 },
      { id: "goal.g", score: NaN }, { id: "goal.g", score: -1 }, { id: "goal.g", score: Infinity },
    ];
  } });
  assert.deepEqual(await search.search(" "), { query: " ", hits: [], goals: [] });
  assert.equal(called, 0);
  const r = await search.search("export", { types: ["goal"], limit: 1 });
  assert.deepEqual(r.hits.map(h => [h.id, h.score, h.relevance, h.matched]), [["goal.g", 2, 1, {}]]);
  assert.equal(r.goals[0].score, 6);
  assert.equal(r.goals[0].relevance, 0.6);
  assert.deepEqual([...core.goalsOf(graph, "procedure.a")], [["goal.g", 1]]);
  assert.equal(core.createSearchIndex(graph, { stopwords: new Set(["EXPORT"]) }).search("export").hits.length, 0);
});

test("resolver policies control satisfiers, ranking, messages and tenant context", async () => {
  const { graph } = await core.lintKB(core.memorySource({
    ...files, "procedures/a.md": proc("A", "preconditions: [state.ready]\noptional_preconditions: [state.extra]\n"),
    "procedures/b.md": proc("B"), "procedures/c.md": proc("C"),
    "states/ready.md": "---\ntype: state\ntitle: Ready\nsummary: ready\ncheck: check\nsatisfied_by: [procedure.b, procedure.c]\n---",
    "states/extra.md": "---\ntype: state\ntitle: Extra\nsummary: extra\ncheck: check\nsatisfied_by: [procedure.b, procedure.c]\n---",
    "goals/g.md": goal(["procedure.a", "procedure.b"]),
  }));
  const resolved = core.resolveGoal(graph, "goal.g", {
    tenant: { context: { blocked: "procedure.b" } },
    availability: (node, tenant) => node.id === tenant?.context?.blocked ? ["Contact support"] : [],
    rank: (a, b) => b.order - a.order,
  });
  assert.equal(resolved.alternatives[0].procedure.id, "procedure.b");
  assert.deepEqual(resolved.alternatives[0].unavailableReasons, ["Contact support"]);
  assert.equal("order" in resolved.alternatives[0], false);
  const a = resolved.alternatives[1];
  assert.ok(a.plan.some(s => s.kind === "run" && s.procedure.id === "procedure.c"));
  assert.equal(a.plan.find(s => s.kind === "run" && s.procedure.id === "procedure.a")?.optional?.[0].fix, "procedure.c");
  assert.equal(a.available, true);
});

test("renderer composes sections once and keeps priority zero above budget", async () => {
  const { graph } = await core.lintKB(core.memorySource(files));
  const r = core.resolveGoal(graph, "goal.g");
  let calls = 0;
  const rendered = core.renderResolvedGoal(r, { tokenBudget: 1, sections(defaults, resolved) {
    calls++;
    assert.equal(resolved, r);
    return [...defaults.filter(s => s.name !== "goal"), { name: "custom", priority: 0, text: "Custom section" }];
  } });
  assert.equal(calls, 1);
  assert.match(rendered.text, /Custom section/);
  assert.ok(!rendered.text.includes("# Goal:"));
  assert.ok(rendered.tokens > 1);
  assert.deepEqual(core.fitSections(core.buildRenderSections(r), 2000), core.renderResolvedGoal(r));
});

test("facade loads once, awaits extensions and preserves tenant defaults by field", async () => {
  let listed = 0, indexed = 0;
  const kb = await core.createKB({ name: "remote", async list() { listed++; return Object.entries(files).map(([relPath, content]) => ({ relPath, content })); } }, {
    search: async () => { indexed++; return { search: async () => [{ id: "procedure.a", score: 7 }] }; },
    resolve: { tenant: { plan: "pro", permissions: ["read"], context: { entitled: true } }, availability(node, tenant) {
      assert.equal(tenant?.plan, "pro");
      assert.deepEqual(tenant?.permissions, ["write"]);
      assert.deepEqual(tenant?.context, { entitled: true });
      return [];
    } },
    renderer: async (resolved) => ({ text: resolved.goal.id, tokens: 1, omitted: [] }),
  });
  assert.equal(core.isKB(kb), true);
  assert.equal(core.isKB(core.memorySource(files)), false);
  assert.equal(Object.getOwnPropertyDescriptor(kb, Symbol.for("simplink.kb"))?.enumerable, false);
  assert.equal(kb.status.root, "remote");
  assert.equal(kb.node("procedure.a")?.title, "Export");
  assert.equal((await kb.search("export")).hits[0].score, 7);
  const r = kb.resolveGoal("goal.g", { tenant: { permissions: ["write"], plan: undefined }, maxDepth: undefined });
  assert.equal((await kb.render(r)).text, "goal.g");
  assert.equal(listed, 1);
  assert.equal(indexed, 1);
});

test("tools reuse the facade, await handlers, validate custom schemas and catch rejections", async () => {
  const kb = await core.createKB(core.memorySource(files), {
    search: async () => ({ search: async () => [{ id: "goal.g", score: 1 }] }),
    resolve: { tenant: { plan: "pro", permissions: ["read"], context: { allowed: true } }, availability: (_, t) => t?.plan === "pro" && t.context?.allowed && t.permissions?.includes("read") ? [] : ["Denied"] },
    renderer: async r => ({ text: `custom:${r.alternatives[0].available}`, tokens: 1, omitted: [] }),
  });
  const tools = await core.createKBTools(kb, { tools: defaults => [
    ...defaults.filter(t => t.definition.name !== "get_related"),
    { definition: { name: "custom", description: "test", inputSchema: { type: "object", required: ["x"], properties: { x: { type: "integer" } } } }, handler: async (args, received) => { assert.equal(received, kb); return { content: String((args as { x: number }).x) }; } },
    { definition: { name: "reject", description: "test", inputSchema: { type: "object" } }, handler: async () => { throw new core.ToolError("expected failure"); } },
  ] });
  assert.equal((await tools.call("resolve_goal", { goal_id: "goal.g" })).content, "custom:true");
  assert.equal((await tools.call("custom", { x: 3 })).content, "3");
  assert.equal((await tools.call("custom", { x: "bad" })).isError, true);
  assert.equal((await tools.call("reject", {})).content, "expected failure");
  assert.equal((await tools.call("get_related", {})).isError, true);
  assert.match((await tools.call("resolve_goal", { goal_id: "goal.missing" })).content, /Did you mean: goal.g/);
  await assert.rejects(core.createKBTools(kb, { extensions: {} }), /extensions/i);
  await assert.rejects(core.createKBTools(kb, { tools: defaults => [...defaults, defaults[0]] }), /duplicate/i);
  assert.equal((await core.createKBTools(core.memorySource(files))).status.errors, 0);
});

test("filesystem and memory sources produce identical parsed snapshots", async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const root = await mkdtemp(path.join(tmpdir(), "simp-sources-"));
  const input = { ...files, "index.md": "ignored", "procedures/.hidden.md": "ignored", "procedures/ignored.txt": "ignored" };
  try {
    for (const [rel, content] of Object.entries(input)) {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), content);
    }
    assert.deepEqual(await core.loadDocs(core.fsSource(root)), await core.loadDocs(core.memorySource(input)));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("ranking filters before limits and keeps first metadata on duplicate score ties", async () => {
  const { graph } = await core.lintKB(core.memorySource({ ...files, "procedures/old.md": proc("Old", "status: deprecated\n") }));
  const r = core.rankResults(graph, "anything", [
    { id: "procedure.old", score: 100 }, { id: "procedure.a", score: 9, matched: { first: [] } },
    { id: "procedure.a", score: 9, matched: { second: [] } }, { id: "goal.g", score: 9 },
    { id: "goal.g", score: 0 },
  ], { limit: 1 });
  assert.deepEqual(r.hits.map(h => [h.id, h.matched]), [["procedure.a", { first: [] }]]);
  assert.equal(r.hits[0].relevance, 1);
  assert.equal(core.rankResults(graph, "x", [{ id: "procedure.old", score: 1 }], { includeDeprecated: true }).hits.length, 1);
});

test("facade and tools propagate or convert asynchronous extension failures", async () => {
  await assert.rejects(core.createKB(core.memorySource(files), { search: async () => { throw Error("index failed"); } }), /index failed/);
  const kb = await core.createKB(core.memorySource(files), {
    search: () => ({ search: async () => { throw Error("search failed"); } }),
    renderer: async () => { throw Error("render failed"); },
  });
  await assert.rejects(kb.search("x"), /search failed/);
  await assert.rejects(kb.render(kb.resolveGoal("goal.g")), /render failed/);
  const tools = await core.createKBTools(kb);
  assert.match((await tools.call("search_kb", { query: "x" })).content, /Internal error.*search failed/);
  assert.match((await tools.call("resolve_goal", { goal_id: "goal.g" })).content, /Internal error.*render failed/);
});

test("tool definitions are independent and hidden tenant arguments preserve code defaults", async () => {
  const kb = await core.createKB(core.memorySource(files), {
    resolve: { tenant: { plan: "pro", permissions: ["read"], context: { code: true } }, availability(_, tenant) {
      assert.equal(tenant?.plan, "pro"); assert.deepEqual(tenant?.permissions, ["read"]); assert.equal(tenant?.context?.code, true); return [];
    } },
  });
  const specs = core.defaultToolSpecs();
  specs[0].definition.name = "changed";
  assert.equal(core.defaultToolSpecs()[0].definition.name, "search_kb");
  const tools = await core.createKBTools(kb, { tenantContext: false });
  assert.equal((await tools.call("resolve_goal", { goal_id: "goal.g", plan: "other" })).isError, true);
  assert.equal((await tools.call("resolve_goal", { goal_id: "goal.g" })).isError, undefined);
});

test("availability policies apply in choice branches and custom ranking ties keep declaration order", async () => {
  const { choiceYaml } = await import("./helpers.js");
  const { graph } = await core.lintKB(core.memorySource({
    "goals/g.md": goal(["procedure.a", "procedure.b"]),
    "procedures/a.md": proc("A", choiceYaml("route", [["blocked", "procedure.c"], ["open", "procedure.d"]]), "1. choice:route"),
    "procedures/b.md": proc("B"), "procedures/c.md": proc("C"), "procedures/d.md": proc("D"),
  }));
  const opts = { availability: (n: core.KBNode) => n.id === "procedure.c" ? ["Contact support"] : [], rank: () => 0 };
  const r = core.resolveGoal(graph, "goal.g", opts);
  assert.deepEqual(r.alternatives.map(a => a.procedure.id), ["procedure.a", "procedure.b"]);
  const step = r.alternatives[0].plan.find(s => s.kind === "run");
  assert.ok(step?.kind === "run");
  const choice = step.steps.find(s => typeof s !== "string");
  assert.ok(choice && typeof choice !== "string");
  assert.deepEqual(choice.options.map(o => o.available), [false, true]);
  assert.equal(r.alternatives[0].available, true);
  const selected = core.resolveGoal(graph, "goal.g", { ...opts, choices: { route: "blocked" } });
  assert.equal(selected.alternatives[0].available, false);
});

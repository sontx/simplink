import test from "node:test";
import assert from "node:assert/strict";
import { fsSource } from "@sontx/simplink-core";
import { fileURLToPath } from "node:url";
import { memoryStore, type KBStore } from "../src/workspace/store.js";
import { WorkspaceService } from "../src/workspace/service.js";

async function fixture() {
  return Object.fromEntries(
    (
      await fsSource(
        fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
      ).list()
    ).map((file) => [file.relPath, file.content]),
  );
}
const rel = "procedures/zalo/send-message.md";

test("playground runs validated MCP tools against the current workspace", async () => {
  const service = await WorkspaceService.open(memoryStore(await fixture()));
  for (const [name, args] of [
    ["search_kb", { query: "zalo" }],
    ["resolve_goal", { goal_id: "goal.send-zalo-message" }],
    ["resolve_procedure", { procedure_id: "procedure.zalo.send-message" }],
    ["get_node", { id: "goal.send-zalo-message" }],
    ["get_related", { id: "goal.send-zalo-message" }],
  ] as const) {
    const result = await service.callTool(name, args);
    assert.ok(result.content);
    assert.ok(!result.isError, result.content);
  }
  assert.equal(
    (await service.callTool("get_related", { id: "x", depth: 9 })).isError,
    true,
  );
  const path = "goals/playground.md";
  await service.writeFile(
    path,
    "---\ntype: goal\ntitle: Playground test\n---\nFresh content\n",
    { create: true },
  );
  assert.match(
    (await service.callTool("get_node", { id: "goal.playground" })).content,
    /Fresh content/,
  );
  service.close();
  await assert.rejects(
    service.callTool("search_kb", { query: "zalo" }),
    /Workspace closed/,
  );
});

test("chosen UI language drives generated docs, plans, and playground plans", async () => {
  const service = await WorkspaceService.open(memoryStore(await fixture()));
  const route = "guides/messaging/send-a-message.md";
  assert.deepEqual(service.docs("site", "vi"), service.docs("site", "en"));
  const english = service.page("site", route, "en").content;
  const vietnamese = service.page("site", route, "vi").content;
  assert.match(english, /## Steps/);
  assert.match(vietnamese, /## Các bước/);
  assert.doesNotMatch(vietnamese, /## Steps/);
  const plan = await service.resolve("goal.send-zalo-message", "vi");
  assert.match(plan.rendered.text, /# Mục tiêu: /);
  const tool = await service.callTool("resolve_goal", {
    goal_id: "goal.send-zalo-message",
    language: "vi",
  });
  assert.ok(!tool.isError, tool.content);
  assert.match(tool.content, /## Đề xuất: /);
  service.close();
});

test("workspace reads, edits, validates, resolves and repairs fixture documents", async () => {
  const files = await fixture();
  const service = await WorkspaceService.open(
    memoryStore(files, {}, "fixture"),
  );
  assert.equal(service.snapshot().status.errors, 0);
  assert.equal(service.schema().procedure.uses, "capability");
  assert.equal(service.schema().goal.procedures, "procedure");
  assert.equal(service.schema().procedure.related, "node");
  assert.ok((await service.search("zalo")).hits.length);
  assert.ok((await service.resolve("goal.send-zalo-message")).rendered);
  assert.throws(
    () => service.resolve("state.channel.zalo-connected"),
    /Only goals and procedures/,
  );
  assert.ok(
    service.docs("site").includes("guides/messaging/send-a-message.md"),
  );
  assert.match(
    service.page("site", "guides/messaging/send-a-message.md").content,
    /# /,
  );
  assert.throws(() => service.page("site", "missing.md"), /Not found/);
  assert.throws(() => service.docs("bad"), /Invalid docs layout/);
  const original = files[rel];
  await service.writeFile(rel, "---\ntype: [\n---\nBroken\n");
  assert.ok(service.snapshot().status.errors);
  assert.equal(
    service.nodeDetail("procedure.zalo.send-message").raw,
    "---\ntype: [\n---\nBroken\n",
  );
  await service.writeFile(rel, original);
  assert.equal(service.snapshot().status.errors, 0);
  for (const invalid of [
    "../escape.md",
    "goals/x.txt",
    "goals/../escape.md",
    "goals\\escape.md",
    "goals//x.md",
    "goals/./x.md",
    "goals/.hidden/x.md",
    "/goals/x.md",
  ])
    await assert.rejects(service.writeFile(invalid, "x"), /Invalid path/);
  await assert.rejects(
    service.writeFile(rel, original, { create: true }),
    /File already exists/,
  );
  for (const [kind, targets] of [
    ["procedures", []],
    ["uses", ["goal.send-zalo-message"]],
    ["related", ["missing"]],
    ["related", ["goal.send-zalo-message", "goal.send-zalo-message"]],
  ] as [string, string[]][])
    await assert.rejects(
      service.patchEdges("procedure.zalo.send-message", kind, targets),
      /Invalid relationship/,
    );
  await service.patchEdges("procedure.zalo.send-message", "related", [
    "goal.send-zalo-message",
  ]);
  assert.ok(
    service
      .nodeDetail("procedure.zalo.send-message")
      .out.some((edge) => edge.kind === "related"),
  );
  await service.writeFile(
    "goals/new/nested.md",
    "---\ntitle: New\nsummary: New goal\n---\n",
    { create: true },
  );
  await service.deleteFile("goals/new/nested.md");
  assert.throws(() => service.nodeDetail("goal.new.nested"), /Node not found/);
});

test("a file whose frontmatter stops parsing still opens from its source", async () => {
  const service = await WorkspaceService.open(memoryStore(await fixture()));
  const broken = "---\ntitle: [unclosed\n---\nBody\n";
  await service.writeFile(rel, broken);
  assert.ok(!service.snapshot().nodes.some((node) => node.path === rel));
  const detail = service.nodeDetail("procedure.zalo.send-message");
  assert.equal(detail.node.path, rel);
  assert.equal(detail.raw, broken);
});

test("memory edits survive reload and closed workspaces cannot affect a new folder", async () => {
  const a = await WorkspaceService.open(memoryStore(await fixture(), {}, "A"));
  const bFiles = await fixture();
  bFiles[rel] = bFiles[rel].replace("summary:", "summary: B ");
  const b = await WorkspaceService.open(memoryStore(bFiles, {}, "B"));
  await a.writeFile(
    rel,
    a.nodeDetail("procedure.zalo.send-message").raw + "\nChanged\n",
  );
  await a.reload();
  assert.match(a.nodeDetail("procedure.zalo.send-message").raw, /Changed/);
  assert.ok(a.store.dirty);
  a.close();
  await assert.rejects(a.writeFile(rel, "overwrite"), /Workspace closed/);
  assert.equal(b.snapshot().status.root, "B");
  assert.match(b.nodeDetail("procedure.zalo.send-message").node.summary, /^B /);
  assert.doesNotMatch(
    b.nodeDetail("procedure.zalo.send-message").raw,
    /Changed/,
  );
});

test("failed writes leave snapshot intact and do not poison subsequent queued writes", async () => {
  const base = memoryStore(await fixture(), {}, "fixture");
  let fail = true;
  const store: KBStore = {
    ...base,
    async write(...args) {
      if (fail) {
        fail = false;
        throw new Error("Permission denied");
      }
      await base.write(...args);
    },
  };
  const service = await WorkspaceService.open(store);
  const original = service.nodeDetail("procedure.zalo.send-message").raw;
  const first = service.writeFile(rel, "wrong");
  const second = service.writeFile(rel, original + "\nSaved\n");
  await assert.rejects(first, /Permission denied/);
  await second;
  assert.match(service.nodeDetail("procedure.zalo.send-message").raw, /Saved/);
});

test("reload and later writes wait for a slow write, and close rejects queued mutations", async () => {
  const base = memoryStore(await fixture(), {}, "fixture");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store: KBStore = {
    ...base,
    async write(...args) {
      await gate;
      await base.write(...args);
    },
  };
  const service = await WorkspaceService.open(store);
  const original = service.nodeDetail("procedure.zalo.send-message").raw;
  const first = service.writeFile(rel, original + "\nFirst\n");
  const reload = service.reload();
  release();
  await Promise.all([first, reload]);
  assert.match(service.nodeDetail("procedure.zalo.send-message").raw, /First/);
  const second = service.writeFile(rel, original + "\nSecond\n");
  const third = service.writeFile(rel, original + "\nThird\n");
  await Promise.all([second, third]);
  assert.match(service.nodeDetail("procedure.zalo.send-message").raw, /Third/);
  const pending = service.writeFile(rel, "closed");
  service.close();
  await assert.rejects(pending, /Workspace closed/);
});

test("failed rebuild retains the previous KB, marks it stale and recovers on reload", async () => {
  const store = memoryStore(await fixture(), {}, "fixture");
  const service = await WorkspaceService.open(store);
  await service.writeFile(rel, "saved to store");
  const previous = service.snapshot();
  const list = store.list;
  store.list = async () => {
    throw new Error("Read failed");
  };
  await assert.rejects(service.reload(), /Read failed/);
  assert.deepEqual(service.snapshot(), { ...previous, stale: true });
  store.list = list;
  await service.reload();
  assert.equal(service.snapshot().stale, false);
  assert.equal(
    service.nodeDetail("procedure.zalo.send-message").raw,
    "saved to store",
  );
});

test("docs export errors are preserved while graph export remains available", async () => {
  const files = await fixture();
  for (const name of ["first", "second"])
    files[`constraints/${name}.md`] =
      `---\ntype: constraint\ntitle: ${name}\nsummary: ${name}\nseverity: warning\ndocs:\n  path: reference/shared.md\n---\n`;
  const service = await WorkspaceService.open(
    memoryStore(files, {}, "fixture"),
  );
  assert.throws(
    () => service.docs("site"),
    /Duplicate docs path: reference\/shared.md/,
  );
  assert.ok(service.docs("graph").length);
});

test("edge edits re-read the file so external changes are kept", async () => {
  const store = memoryStore(await fixture(), {}, "fixture");
  const service = await WorkspaceService.open(store);
  const raw = service.nodeDetail("procedure.zalo.send-message").raw;
  await store.write(rel, raw + "\nExternal\n");
  await service.patchEdges("procedure.zalo.send-message", "related", [
    "goal.send-zalo-message",
  ]);
  assert.match(await store.read(rel), /External/);
});

test("plan inputs list only the states and choices a plan can reach", async () => {
  const service = await WorkspaceService.open(memoryStore(await fixture()));
  const all = service.planInputs("goal.send-zalo-message");
  assert.deepEqual(
    new Set(all.states),
    new Set([
      "state.channel.zalo-connected",
      "state.audience.segment-created",
      "state.zalo.template-approved",
      "state.zalo.recipients-follow-oa",
    ]),
  );
  assert.equal(all.choices.length, 1);
  assert.ok(all.choices[0].startsWith("procedure.zalo.send-message:"));
  const byPhone = service.planInputs("goal.send-zalo-message", {
    [all.choices[0]]: "phone",
  });
  assert.ok(byPhone.states.includes("state.zalo.template-approved"));
  assert.ok(!byPhone.states.includes("state.zalo.recipients-follow-oa"));
  assert.deepEqual(byPhone.choices, all.choices);
  const broadcast = service.planInputs("goal.send-zalo-broadcast");
  assert.deepEqual(broadcast.choices, []);
  assert.ok(!broadcast.states.includes("state.zalo.recipients-follow-oa"));
  assert.deepEqual(service.planInputs("state.channel.zalo-connected"), {
    states: [],
    choices: [],
  });
});

test("memory stores count changed files until they are downloaded", async () => {
  const service = await WorkspaceService.open(memoryStore(await fixture()));
  assert.equal(service.snapshot().changed, 0);
  assert.equal(service.store.dirty, false);
  const raw = service.nodeDetail("procedure.zalo.send-message").raw;
  await service.writeFile(rel, raw + "\nOne\n");
  await service.writeFile(rel, raw + "\nTwo\n");
  assert.equal(service.snapshot().changed, 1);
  assert.ok(service.store.dirty);
  await service.exportZip();
  assert.equal(service.snapshot().changed, 0);
  assert.equal(service.store.dirty, false);
  await service.writeFile(rel, raw);
  assert.equal(service.snapshot().changed, 1);
  // Writing the downloaded content back is no change at all.
  await service.writeFile(rel, raw + "\nTwo\n");
  assert.equal(service.snapshot().changed, 0);
});

test("a deleted file can be restored exactly, and its notice dismissed", async () => {
  const service = await WorkspaceService.open(memoryStore(await fixture()));
  const raw = service.nodeDetail("procedure.zalo.send-message").raw;
  await service.deleteFile(rel);
  assert.deepEqual(service.snapshot().deleted, {
    path: rel,
    id: "procedure.zalo.send-message",
    title: service.snapshot().deleted?.title,
  });
  assert.ok(
    !service
      .snapshot()
      .nodes.some((n) => n.id === "procedure.zalo.send-message"),
  );
  await service.restoreDeleted();
  assert.equal(service.nodeDetail("procedure.zalo.send-message").raw, raw);
  assert.equal(service.snapshot().deleted, undefined);
  // Deleting and restoring nets out to no change since opening.
  assert.equal(service.snapshot().changed, 0);
  await service.deleteFile(rel);
  service.dismissDeleted();
  assert.equal(service.snapshot().deleted, undefined);
  await assert.rejects(service.restoreDeleted(), /Nothing to restore/);
});

test("relationships cannot point a node at itself", async () => {
  const service = await WorkspaceService.open(memoryStore(await fixture()));
  await assert.rejects(
    service.patchEdges("procedure.zalo.send-message", "related", [
      "procedure.zalo.send-message",
    ]),
    /related to itself/,
  );
});

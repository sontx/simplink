import test from "node:test";
import assert from "node:assert/strict";
import { createKB } from "../src/kb.js";
import { createKBTools } from "../src/tools/core.js";
import { memorySource } from "../src/source.js";
import { createPeerService } from "../src/federation/service.js";
import { createFederatedKB } from "../src/federation/kb.js";
import { proc, goal } from "./helpers.js";

const simp = (name: string, extra = "") =>
  `---\ntype: simp\nname: ${name}\ntitle: ${name}\nsummary: ${name}\n${extra}---\n`;
async function tools() {
  const crm = await createKB(
    memorySource({
      "simp.md": simp("crm"),
      "goals/import.md": goal(["procedure.import"]),
      "procedures/import.md": proc("Import customers"),
      "states/imported.md":
        "---\ntype: state\ntitle: Imported\nsummary: Imported\ncheck: Look\nsatisfied_by: [procedure.import]\n---\n",
    }),
  );
  const local = await createKB(
    memorySource({
      "simp.md": simp("x", "peers: [{name: crm}]\n"),
      "procedures/send.md": proc(
        "send",
        "preconditions: [crm:state.imported]\n",
      ),
    }),
  );
  return createKBTools(
    await createFederatedKB({ local, peers: [createPeerService({ kb: crm })] }),
  );
}
test("search_kb returns remote hits with simp", async () => {
  const r = await (
    await tools()
  ).call("search_kb", { query: "Import customers" });
  assert.equal(r.isError, undefined);
  assert.ok(
    JSON.parse(r.content).hits.some(
      (h: { id: string; simp: string }) =>
        h.id === "crm:procedure.import" && h.simp === "crm",
    ),
  );
});
test("get_node accepts qualified ids", async () => {
  const r = await (
    await tools()
  ).call("get_node", { id: "crm:state.imported" });
  assert.equal(r.isError, undefined);
  assert.deepEqual(JSON.parse(r.content).out.satisfied_by, [
    "crm:procedure.import",
  ]);
});
test("get_related crosses simps", async () => {
  const r = await (
    await tools()
  ).call("get_related", { id: "procedure.send", depth: 2, direction: "out" });
  assert.equal(r.isError, undefined);
  const ids = JSON.parse(r.content).nodes.map((n: { id: string }) => n.id);
  assert.ok(ids.includes("crm:state.imported"));
  assert.ok(ids.includes("crm:procedure.import"));
});
test("unknown remote id suggests similar ids", async () => {
  const r = await (
    await tools()
  ).call("get_node", { id: "crm:procedure.importt" });
  assert.equal(r.isError, true);
  assert.match(r.content, /Did you mean: crm:procedure.import/);
});

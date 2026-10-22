import test from "node:test";
import assert from "node:assert/strict";
import { createKB } from "../src/kb.js";
import { memorySource } from "../src/source.js";
import { resolveFederated, prefetch } from "../src/federation/prefetch.js";
import type { LookupNode } from "../src/federation/protocol.js";
import { proc, sig, choiceYaml } from "./helpers.js";

const remote = (
  id: string,
  fields: Record<string, unknown>,
  body = "",
): LookupNode => ({
  id,
  type: id.includes(":state.") ? "state" : "procedure",
  title: id,
  summary: id,
  status: "active",
  aliases: [],
  tags: [],
  fields,
  body,
  out: [],
  in: [],
});
const docs = new Map([
  [
    "crm:state.imported",
    remote("crm:state.imported", {
      check: "Look",
      satisfied_by: ["crm:procedure.import"],
    }),
  ],
  [
    "crm:procedure.import",
    {
      ...remote(
        "crm:procedure.import",
        { requires: ["crm:procedure.login"] },
        "## Steps\n1. Import",
      ),
      availability: { plans: ["pro"] },
    },
  ],
  [
    "crm:procedure.login",
    remote("crm:procedure.login", {}, "## Steps\n1. Login"),
  ],
]);
const fetchNodes = async (ids: string[]) =>
  new Map(
    ids.flatMap((id) => (docs.has(id) ? [[id, docs.get(id)!] as const] : [])),
  );
const localKB = () =>
  createKB(
    memorySource({
      "procedures/send.md": proc(
        "send",
        "preconditions: [crm:state.imported]\n",
      ),
    }),
  );

test("plan includes remote check and satisfier steps", async () => {
  const local = await localKB();
  const plan = await resolveFederated(
    local,
    "procedure",
    "procedure.send",
    {},
    fetchNodes,
  );
  assert.deepEqual(sig(plan.alternatives[0].plan), [
    "check:crm:state.imported",
    "run:crm:procedure.login?crm:state.imported",
    "run:crm:procedure.import?crm:state.imported",
    "run:procedure.send",
  ]);
  assert.ok(
    plan.warnings.includes("availability of crm:procedure.import not checked"),
  );
  assert.notEqual(plan.alternatives[0].available, false);
});

test("known remote state skips the check", async () => {
  const plan = await resolveFederated(
    await localKB(),
    "procedure",
    "procedure.send",
    { states: { "crm:state.imported": true } },
    fetchNodes,
  );
  assert.deepEqual(sig(plan.alternatives[0].plan), ["run:procedure.send"]);
});

test("remote capability availability is not checked and is reported", async () => {
  const local = await createKB(
    memorySource({
      "procedures/send.md": proc("send", "requires: [crm:procedure.import]\n"),
    }),
  );
  const cap = {
    ...remote("crm:capability.api", {}),
    type: "capability" as const,
    availability: { plans: ["pro"] },
  };
  const procedure = remote(
    "crm:procedure.import",
    { uses: [cap.id] },
    "## Steps\n1. Import",
  );
  const all = new Map([
    [cap.id, cap],
    [procedure.id, procedure],
  ]);
  const plan = await resolveFederated(
    local,
    "procedure",
    "procedure.send",
    {},
    async (ids) =>
      new Map(
        ids.flatMap((id) => (all.has(id) ? [[id, all.get(id)!] as const] : [])),
      ),
  );
  assert.ok(
    plan.warnings.includes("availability of crm:capability.api not checked"),
  );
});

test("unreachable peer degrades to warnings", async () => {
  const plan = await resolveFederated(
    await localKB(),
    "procedure",
    "procedure.send",
    {},
    async () => new Map(),
  );
  assert.ok(plan.warnings.includes('unreachable node "crm:state.imported"'));
  assert.ok(sig(plan.alternatives[0].plan).includes("run:procedure.send"));
});

test("resolves a remote goal id from a search hit", async () => {
  const goal = {
    ...remote("crm:goal.import", { procedures: ["crm:procedure.import"] }),
    type: "goal" as const,
  };
  const plan = await resolveFederated(
    undefined,
    "goal",
    goal.id,
    {},
    async (ids) => {
      const result = await fetchNodes(ids);
      if (ids.includes(goal.id)) result.set(goal.id, goal);
      return result;
    },
  );
  assert.equal(plan.goal.id, goal.id);
  assert.equal(plan.alternatives.length, 1);
});

test("local-only resolution keeps KB resolver defaults", async () => {
  const kb = await createKB(memorySource({ "procedures/a.md": proc("a") }), {
    resolve: { maxDepth: 1, tenant: { plan: "free" } },
  });
  assert.deepEqual(
    await resolveFederated(kb, "procedure", "procedure.a", {}, fetchNodes),
    kb.resolveProcedure("procedure.a"),
  );
});

test("prefetch visits each missing reference once and bounds closure", async () => {
  const calls: string[][] = [];
  const result = await prefetch(
    "crm:procedure.import",
    undefined,
    async (ids) => {
      calls.push(ids);
      return fetchNodes(ids);
    },
    8,
  );
  assert.equal(result.fetched, 2);
  assert.deepEqual(calls, [["crm:procedure.import"], ["crm:procedure.login"]]);
});

test("pull resolution accepts qualified choice keys", async () => {
  const kb = await createKB(
    memorySource({
      "procedures/import.md": proc(
        "import",
        choiceYaml("source", [
          ["csv", "procedure.csv"],
          ["api", "procedure.api"],
        ]),
        "1. choice:source",
      ),
      "procedures/csv.md": proc("CSV"),
      "procedures/api.md": proc("API"),
    }),
  );
  const remoteDocs = new Map(
    [...kb.graph.nodes].map(([id, n]) => {
      const choices = n.data.choices as
        | {
            id: string;
            question: string;
            options: { key: string; when: string; procedure: string }[];
          }[]
        | undefined;
      const fields = {
        ...n.data,
        ...(choices
          ? {
              choices: choices.map((c) => ({
                ...c,
                options: c.options.map((o) => ({
                  ...o,
                  procedure: `crm:${o.procedure}`,
                })),
              })),
            }
          : {}),
      };
      return [
        `crm:${id}`,
        { ...remote(`crm:${id}`, fields, n.body), type: n.type },
      ] as const;
    }),
  );
  const plan = await resolveFederated(
    undefined,
    "procedure",
    "crm:procedure.import",
    { choices: { "crm:source": "api" } },
    async (ids) =>
      new Map(
        ids.flatMap((id) =>
          remoteDocs.has(id) ? [[id, remoteDocs.get(id)!] as const] : [],
        ),
      ),
  );
  const step = plan.alternatives[0].plan.at(-1)!;
  assert.equal(step.kind, "run");
  if (step.kind === "run") {
    const choice = step.steps[0];
    assert.notEqual(typeof choice, "string");
    if (typeof choice !== "string") assert.equal(choice.selected, "api");
  }
});

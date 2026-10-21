import "../../web/src/polyfills.js";
import {
  createKB,
  memorySource,
  compileValidator,
} from "@sontx/simplink-core/browser";
import { schemas } from "../../web/src/lib/frontmatter.js";
import { memoryStore } from "../../web/src/workspace/store.js";
import { WorkspaceService } from "../../web/src/workspace/service.js";

const fixtures = import.meta.glob("../../../../test/fixtures/kb/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const files = Object.fromEntries(
  Object.entries(fixtures).map(([path, content]) => [
    path.split("test/fixtures/kb/")[1],
    content,
  ]),
);
async function smoke() {
  const kb = await createKB(memorySource(files), {
    validator: compileValidator(schemas),
  });
  const service = await WorkspaceService.open(
    memoryStore(files, {}, "fixture"),
  );
  const invalid = compileValidator(schemas)("goal", {});
  const search = await kb.search("zalo");
  const rendered = await kb.render(kb.resolveGoal("goal.send-zalo-message"));
  const site = kb.docs({ layout: "site" });
  const graph = kb.docs({ layout: "graph" });
  await service.patchEdges("procedure.zalo.send-message", "related", [
    "goal.send-zalo-message",
  ]);
  const patched = service
    .nodeDetail("procedure.zalo.send-message")
    .out.some(
      (edge) => edge.kind === "related" && edge.to === "goal.send-zalo-message",
    );
  if (
    !kb.status.nodes ||
    kb.status.errors ||
    !invalid.length ||
    !search.hits.length ||
    !rendered.text ||
    !site.length ||
    !graph.length ||
    !patched
  )
    throw new Error("Browser smoke assertion failed");
  return {
    nodes: kb.status.nodes,
    invalid: invalid.length,
    hits: search.hits.length,
    site: site.length,
    graph: graph.length,
    patched,
  };
}
smoke().then(
  (result) => {
    (window as any).__smoke = { ok: true, ...result };
  },
  (error) => {
    (window as any).__smoke = {
      ok: false,
      error: String(error),
      stack: error.stack,
    };
  },
);

import "../../src/polyfills.js";
import {
  createKB,
  memorySource,
  compileValidator,
} from "@sontx/simplink-core/browser";
import { schemas } from "../../src/lib/frontmatter.js";
import { memoryStore } from "../../src/workspace/store.js";
import { WorkspaceService } from "../../src/workspace/service.js";

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
  const federation = await createKB(
    memorySource({
      "simp.md":
        "---\ntype: simp\nname: browser\ntitle: Browser homepage\nsummary: Browser knowledge\npeers: [{name: crm, docs_url: https://docs.example/crm}]\n---\n[Customers](simp://crm/goal.import#steps)\n",
    }),
    { validator: compileValidator(schemas) },
  );
  const homepage = federation.docs().find((p) => p.path === "index.md");
  // The simp body is the homepage as written (no generated title).
  if (
    federation.status.errors ||
    !homepage?.content.includes(
      "https://docs.example/crm/goals/import.md#steps",
    )
  )
    throw new Error("Simp homepage or remote docs link failed");
  // A KB image reaches the page as a blob: URL the browser decodes from the File itself.
  const png = Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    ),
    (c) => c.charCodeAt(0),
  );
  const pictured = await WorkspaceService.open(
    memoryStore(files, { "assets/dot.png": new Blob([png]) }, "pictured"),
  );
  const asset = await pictured.asset("assets/dot.png");
  const objectUrl = URL.createObjectURL(asset as Blob);
  const image = new Image();
  image.src = objectUrl;
  await image.decode();
  URL.revokeObjectURL(objectUrl);
  if (image.naturalWidth !== 1) throw new Error("KB image did not load");
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

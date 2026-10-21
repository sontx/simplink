import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { memoryStore } from "../src/workspace/store.js";
import { WorkspaceService } from "../src/workspace/service.js";
import { fsSource } from "@sontx/simplink-core";
import { fileURLToPath } from "node:url";

test("docs zip exports every generated page with nested paths in either layout and store mode", async () => {
  const files = Object.fromEntries(
    (
      await fsSource(
        fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
      ).list()
    ).map((file) => [file.relPath, file.content]),
  );
  for (const kind of ["memory", "directory"] as const) {
    const service = await WorkspaceService.open({
      ...memoryStore(files),
      kind,
    });
    for (const layout of ["site", "graph"]) {
      const archive = unzipSync(service.exportDocsZip(layout));
      assert.deepEqual(
        Object.keys(archive).sort(),
        service.docs(layout).sort(),
      );
      const path =
        layout === "site"
          ? "guides/messaging/send-a-message.md"
          : "goals/send-zalo-message.md";
      assert.match(strFromU8(archive[path]), /# /);
      for (const [path, content] of Object.entries(archive))
        assert.equal(strFromU8(content), service.page(layout, path).content);
    }
    assert.throws(() => service.exportDocsZip("bad"), /Invalid docs layout/);
  }
});

test("zip exports current edits and unchanged assets, excluding dot files and folders", async () => {
  const service = await WorkspaceService.open(
    memoryStore(
      { "capabilities/page.md": "original", ".git/secret.md": "secret" },
      {
        "images/logo.svg": new Blob(["<svg/>"]),
        ".hidden": new Blob(["secret"]),
      },
      "KB",
    ),
  );
  await service.writeFile("capabilities/page.md", "edited");
  await service.reload();
  const zip = unzipSync(await service.exportZip());
  assert.deepEqual(Object.keys(zip).sort(), [
    "capabilities/page.md",
    "images/logo.svg",
  ]);
  assert.equal(strFromU8(zip["capabilities/page.md"]), "edited");
  assert.equal(strFromU8(zip["images/logo.svg"]), "<svg/>");
});

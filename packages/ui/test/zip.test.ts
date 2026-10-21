import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { memoryStore } from "../src/workspace/store.js";
import { WorkspaceService } from "../src/workspace/service.js";

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

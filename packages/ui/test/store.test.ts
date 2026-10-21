import test from "node:test";
import assert from "node:assert/strict";
import {
  directoryStore,
  type DirectoryHandle,
  type FileHandle,
} from "../web/src/workspace/store.js";
import { WorkspaceService } from "../web/src/workspace/service.js";

function folder(name: string): DirectoryHandle & {
  entries: Map<string, DirectoryHandle | FileHandle>;
  failClose: boolean;
} {
  const entries = new Map<string, DirectoryHandle | FileHandle>();
  const directory = {
    name,
    kind: "directory" as const,
    entries,
    failClose: false,
    async *values() {
      yield* entries.values();
    },
    async getDirectoryHandle(name: string, { create = false } = {}) {
      if (!entries.has(name) && create) entries.set(name, folder(name));
      const entry = entries.get(name);
      if (!entry) throw new DOMException("Missing", "NotFoundError");
      if (entry.kind !== "directory")
        throw new DOMException("Wrong kind", "TypeMismatchError");
      return entry;
    },
    async getFileHandle(name: string, { create = false } = {}) {
      if (!entries.has(name) && create) {
        let text = "";
        entries.set(name, {
          kind: "file",
          name,
          async getFile() {
            return new File([text], name);
          },
          async createWritable() {
            let pending = "";
            return {
              async write(content: string) {
                pending = content;
              },
              async close() {
                if (directory.failClose) throw new Error("Close failed");
                text = pending;
              },
              async abort() {},
            };
          },
        });
      }
      const entry = entries.get(name);
      if (!entry) throw new DOMException("Missing", "NotFoundError");
      if (entry.kind !== "file")
        throw new DOMException("Wrong kind", "TypeMismatchError");
      return entry;
    },
    async removeEntry(name: string) {
      if (!entries.delete(name))
        throw new DOMException("Missing", "NotFoundError");
    },
    async requestPermission() {
      return "granted" as const;
    },
  };
  return directory;
}

test("directory store walks Markdown only, excludes dot entries and creates nested files", async () => {
  const root = folder("KB");
  const store = directoryStore(root);
  await store.write("goals/nested/page.md", "hello", { create: true });
  await store.write(".git/private.md", "secret");
  await store.write("goals/.private.md", "secret");
  await store.write("images/logo.svg", "asset");
  assert.deepEqual(await store.list(), [
    { relPath: "goals/nested/page.md", content: "hello" },
  ]);
  await assert.rejects(
    store.write("goals/nested/page.md", "overwrite", { create: true }),
    /File already exists/,
  );
  await store.remove("goals/nested/page.md");
  assert.deepEqual(await store.list(), []);
});

test("a failed writable close rejects without changing the service file snapshot", async () => {
  const root = folder("KB");
  const store = directoryStore(root);
  const raw =
    "---\ntype: capability\ntitle: Original\nsummary: Original\n---\n";
  await store.write("capabilities/page.md", raw);
  const service = await WorkspaceService.open(store);
  const child = root.entries.get("capabilities") as ReturnType<typeof folder>;
  child.failClose = true;
  await assert.rejects(
    service.writeFile("capabilities/page.md", "overwrite"),
    /Close failed/,
  );
  assert.equal(service.nodeDetail("capability.page").raw, raw);
  assert.equal((await store.list())[0].content, raw);
});

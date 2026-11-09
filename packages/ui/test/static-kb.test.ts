import test from "node:test";
import assert from "node:assert/strict";
import {
  NotStaticKBError,
  staticStore,
  type FileCache,
} from "../src/workspace/static-kb.js";
import { urlStore } from "../src/workspace/store.js";
import { WorkspaceService } from "../src/workspace/service.js";

const simp = `---
type: simp
name: shop
title: Shop
summary: Shop KB.
---
Start here.
`;
const goal = (title: string) => `---
type: goal
title: ${title}
summary: Buy things.
---
`;

// A static host; `cors: false` makes direct requests fail like a browser CORS refusal.
function host(files: Record<string, string>, { cors = true } = {}) {
  const calls: string[] = [];
  const fetch = (async (input: string) => {
    const url = new URL(input);
    calls.push(input);
    let target = url;
    if (url.origin === "https://proxy.test")
      target = new URL(url.searchParams.get("url")!);
    else if (!cors) throw new TypeError("Failed to fetch");
    const path = target.pathname.replace(/^\/kb\//, "");
    return target.pathname.startsWith("/kb/") && Object.hasOwn(files, path)
      ? new Response(files[path])
      : new Response("missing", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

function memoryCache(): FileCache & { entries: Map<string, Response> } {
  const entries = new Map<string, Response>();
  return {
    entries,
    async match(url) {
      return entries.get(url)?.clone();
    },
    async put(url, response) {
      entries.set(url, response);
    },
    async delete(url) {
      return entries.delete(url);
    },
    async keys() {
      return [...entries.keys()].map((url) => ({ url }));
    },
  };
}

const files = () => ({
  "simp.md": simp,
  "simp-index.yaml": "protocol: 1\nname: shop\nfiles:\n  - goals/buy.md\n",
  "goals/buy.md": goal("Buy"),
});

test("static store loads a published KB read-only", async () => {
  const kb = host(files());
  const service = await WorkspaceService.open(
    await staticStore("https://kb.cors.test/kb/", {
      fetch: kb.fetch,
      cache: null,
    }),
  );
  assert.equal(service.store.name, "Shop");
  assert.equal(service.store.readOnly, true);
  assert.deepEqual(
    service
      .snapshot()
      .nodes.map((n) => n.id)
      .sort(),
    ["goal.buy", "simp"],
  );
  await assert.rejects(service.writeFile("goals/buy.md", "x"), /read-only/);
});

test("files blocked by CORS load through the proxy, then skip the direct try", async () => {
  const kb = host(files(), { cors: false });
  const store = await staticStore("https://kb.nocors.test/kb", {
    fetch: kb.fetch,
    proxy: "https://proxy.test/",
    cache: null,
  });
  await store.list();
  assert.equal(await store.read("goals/buy.md"), goal("Buy"));
  const direct = kb.calls.filter((call) => !call.startsWith("https://proxy"));
  assert.deepEqual(direct, ["https://kb.nocors.test/kb/simp.md"]);
});

test("without a proxy, a CORS-blocked URL is not a static KB", async () => {
  const kb = host(files(), { cors: false });
  await assert.rejects(
    staticStore("https://kb.blocked.test/kb", { fetch: kb.fetch, cache: null }),
    NotStaticKBError,
  );
});

test("node files come from the cache until the publish changes or the KB reloads", async () => {
  const published = files();
  const kb = host(published);
  const cache = memoryCache();
  const open = async () => {
    const store = await staticStore("https://kb.cache.test/kb", {
      fetch: kb.fetch,
      cache,
    });
    await store.list();
    return store;
  };
  const nodeFetches = () =>
    kb.calls.filter((call) => call.endsWith("goals/buy.md")).length;

  await open();
  assert.equal(nodeFetches(), 1);
  const second = await open();
  assert.equal(nodeFetches(), 1, "second open reads the cache");

  // A reload in the same workspace bypasses the cache.
  published["goals/buy.md"] = goal("Buy now");
  await second.list();
  assert.equal(nodeFetches(), 2);
  assert.equal(await second.read("goals/buy.md"), goal("Buy now"));

  // Republishing with a new simp.md invalidates cached files.
  published["simp.md"] = simp.replace("Start here.", "Start here!");
  published["goals/buy.md"] = goal("Buy again");
  const third = await open();
  assert.equal(nodeFetches(), 3);
  assert.equal(await third.read("goals/buy.md"), goal("Buy again"));
});

test("a removed file is dropped from the cache", async () => {
  const published = {
    ...files(),
    "simp-index.yaml":
      "protocol: 1\nname: shop\nfiles:\n  - goals/buy.md\n  - goals/sell.md\n",
    "goals/sell.md": goal("Sell"),
  };
  const kb = host(published);
  const cache = memoryCache();
  await (
    await staticStore("https://kb.prune.test/kb", { fetch: kb.fetch, cache })
  ).list();
  assert.equal(cache.entries.size, 2);
  published["simp-index.yaml"] = files()["simp-index.yaml"];
  await (
    await staticStore("https://kb.prune.test/kb", { fetch: kb.fetch, cache })
  ).list();
  assert.deepEqual(
    [...cache.entries.keys()],
    ["https://kb.prune.test/kb/goals/buy.md"],
  );
});

test("a KB without simp-index.yaml explains how to publish one", async () => {
  const { "simp-index.yaml": _index, ...rest } = files();
  const store = await staticStore("https://kb.noindex.test/kb", {
    fetch: host(rest).fetch,
    cache: null,
  });
  await assert.rejects(store.list(), /simp-index/);
});

test("url store falls back to a static KB when no simp node answers", async () => {
  const kb = host(files());
  const original = globalThis.fetch;
  globalThis.fetch = kb.fetch;
  try {
    const store = await urlStore("https://kb.url.test/kb", undefined, {
      cache: null,
    });
    assert.equal(store.name, "Shop");
    assert.ok(kb.calls[0].includes("/v1/manifest"));
  } finally {
    globalThis.fetch = original;
  }
});

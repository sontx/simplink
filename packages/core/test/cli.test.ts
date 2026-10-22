import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import * as core from "../src/index.js";
const root = fileURLToPath(
  new URL("../../../test/fixtures/kb/", import.meta.url),
);

test("CLI runners capture output and preserve the host process", async () => {
  const before = process.exitCode;
  for (const [runner, args] of [
    [core.runLint, [root, "--format", "json"]],
    [core.runSearch, ["zalo", "--kb", root, "--format", "json"]],
    [
      core.runResolve,
      ["goal.send-zalo-message", "--kb", root, "--format", "json"],
    ],
  ] as const) {
    assert.equal(typeof runner, "function");
    const lines: string[] = [],
      errors: string[] = [];
    assert.equal(
      await runner([...args], {
        stdout: (line) => lines.push(line),
        stderr: (line) => errors.push(line),
      }),
      0,
    );
    assert.ok(JSON.parse(lines.join("\n")));
    assert.deepEqual(errors, []);
    assert.equal(process.exitCode, before);
  }
});

test("CLI argument and execution failures are captured with exit code two", async () => {
  for (const [runner, args] of [
    [core.runLint, [root, "--format", "bad"]],
    [core.runLint, [root, "--max-warnings", "-2"]],
    [core.runLint, [root, "--max-warnings", "NaN"]],
    [core.runLint, ["--unknown"]],
    [core.runLint, ["--format"]],
    [core.runSearch, ["x", "--type", "bad"]],
    [core.runSearch, ["x", "--limit", "0"]],
    [core.runSearch, ["x", "--limit", "1.5"]],
    [core.runResolve, ["x", "--budget", "Infinity"]],
    [core.runResolve, ["x", "--state", "=true"]],
    [core.runResolve, ["x", "--state", "a=true=extra"]],
    [core.runResolve, ["x", "--choice", "a="]],
    [core.runResolve, ["x", "--choice", ":a=b"]],
    [core.runSearch, ["x", "--kb", "missing-kb"]],
  ] as const) {
    const errors: string[] = [];
    assert.equal(
      await runner([...args], {
        stdout() {},
        stderr: (line) => errors.push(line),
      }),
      2,
      args.join(" "),
    );
    assert.ok(errors.length > 0, args.join(" "));
  }
});

test("CLI runners apply code extensions and await custom search/render", async () => {
  const lines: string[] = [];
  const ctx = {
    stdout: (line: string) => lines.push(line),
    stderr() {},
    extensions: {
      search: async () => ({
        search: async () => [{ id: "goal.send-zalo-message", score: 10 }],
      }),
      renderer: async () => ({
        text: "custom rendered",
        tokens: 4,
        omitted: [],
      }),
    },
  };
  assert.equal(
    await core.runSearch(["anything", "--kb", root, "--format", "json"], ctx),
    0,
  );
  assert.equal(JSON.parse(lines.pop()!).hits[0].id, "goal.send-zalo-message");
  assert.equal(
    await core.runResolve(["goal.send-zalo-message", "--kb", root], ctx),
    0,
  );
  assert.equal(lines.pop(), "custom rendered");
  assert.equal(
    await core.runLint([root], {
      stdout() {},
      stderr() {},
      extensions: {
        validator: async () => {
          throw Error("unavailable");
        },
      },
    }),
    2,
  );
});

test("invalid options report stderr even without a positional argument", async () => {
  for (const [runner, args] of [
    [core.runSearch, ["--type", "bad"]],
    [core.runResolve, ["--budget", "Infinity"]],
  ] as const) {
    const errors: string[] = [];
    assert.equal(
      await runner([...args], { stdout() {}, stderr: (s) => errors.push(s) }),
      2,
    );
    assert.ok(errors.length);
  }
});

test("CLI captures rejected search and renderer extensions", async () => {
  for (const [runner, args, extensions] of [
    [
      core.runSearch,
      ["export", "--kb", root],
      {
        search: () => ({
          search: async () => {
            throw Error("retrieval failed");
          },
        }),
      },
    ],
    [
      core.runResolve,
      ["goal.send-zalo-message", "--kb", root],
      {
        renderer: async () => {
          throw Error("render failed");
        },
      },
    ],
  ] as const) {
    const errors: string[] = [];
    assert.equal(
      await runner([...args], {
        extensions,
        stdout() {},
        stderr: (s) => errors.push(s),
      }),
      2,
    );
    assert.match(errors.join("\n"), /failed/);
  }
});

test("simp dispatches subcommands to the runners and maps usage errors to exit code two", async () => {
  const lines: string[] = [],
    errors: string[] = [];
  const ctx = {
    stdout: (line: string) => lines.push(line),
    stderr: (line: string) => errors.push(line),
  };
  assert.equal(
    await core.runSimp(
      ["lint", root, "--format", "json", "--max-warnings", "-1"],
      ctx,
    ),
    0,
  );
  assert.equal(JSON.parse(lines.join("\n")).root, root);
  lines.length = 0;
  assert.equal(
    await core.runSimp(
      ["search", "zalo", "--kb", root, "--type", "goal", "--format", "json"],
      ctx,
    ),
    0,
  );
  assert.ok(JSON.parse(lines.join("\n")).goals.length);
  assert.equal(await core.runSimp(["--help"], ctx), 0);
  assert.deepEqual(errors, []);
  assert.equal(await core.runSimp(["lnt"], ctx), 2);
  assert.equal(await core.runSimp(["search", "x", "--limit", "0"], ctx), 2);
  assert.equal(await core.runSimp(["resolve", "--kb", root], ctx), 2);
  assert.match(errors.join("\n"), /Did you mean lint/);
});

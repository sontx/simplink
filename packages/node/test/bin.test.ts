import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const bin = fileURLToPath(new URL("../src/bin.ts", import.meta.url));
test("bin help prints usage and missing simp exits 2 without a stack", () => {
  const help = spawnSync(process.execPath, ["--import", "tsx", bin, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: simp-node/);
  const missing = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      bin,
      "--kb",
      fileURLToPath(new URL("../../../test/fixtures/kb/", import.meta.url)),
    ],
    { encoding: "utf8" },
  );
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /has no simp.md/);
  assert.doesNotMatch(missing.stderr, /at .*\.ts:/);
});

import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const help = (script: string) => {
  const result = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL(`../${script}`, import.meta.url)), "--help"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};

test("CLI help uses the simp command names", () => {
  assert.match(help("src/cli.ts"), /^Usage: simp-lint\b/);
  assert.match(help("src/resolve-cli.ts"), /^Usage: simp-resolve\b/);
  assert.match(help("src/search-cli.ts"), /^Usage: simp-search\b/);
});

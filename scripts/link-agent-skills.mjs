import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();

const source = resolve(root, ".agents/skills");

const targets = [
  resolve(root, ".claude/skills"),
  // Add other agents here:
  // resolve(root, ".cursor/skills"),
];

if (!existsSync(source)) {
  console.log("⚠️  .agents/skills does not exist, skipping skill links.");
  process.exit(0);
}

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });

  if (existsSync(target)) {
    const stat = lstatSync(target);

    if (stat.isSymbolicLink()) {
      rmSync(target);
    } else {
      console.log(
        `⚠️  ${target} already exists and is not a symlink, skipping.`,
      );
      continue;
    }
  }

  // "junction" works without administrator privileges on Windows.
  // On Unix it behaves as a normal directory symlink.
  symlinkSync(source, target, "junction");

  console.log(
    `✓ Linked ${target.replace(root, ".")} → ${source.replace(root, ".")}`,
  );
}

import { spawn } from "node:child_process";

const children = [
  spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      "--watch",
      "src/bin.ts",
      "--kb",
      "../../kb",
      ...process.argv.slice(2),
    ],
    { stdio: "inherit" },
  ),
  spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
    stdio: "inherit",
  }),
];

for (const child of children) {
  child.on("exit", (code) => {
    children.forEach((other) => other.kill());
    process.exitCode = code ?? 1;
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => children.forEach((child) => child.kill()));
}

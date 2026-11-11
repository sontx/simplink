import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import { fileURLToPath } from "node:url";
import { cp, writeFile } from "node:fs/promises";
import path from "node:path";

const kbDir = fileURLToPath(new URL("../../kb", import.meta.url));
const outDir = fileURLToPath(new URL("./dist", import.meta.url));

export default defineConfig({
  base: process.env.SIMPLINK_UI_BASE ?? "/",
  root: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    devtools(),
    {
      name: "spa-fallback",
      enforce: "post",
      generateBundle(_options, bundle) {
        const index = bundle["index.html"];
        if (index?.type === "asset")
          this.emitFile({
            type: "asset",
            fileName: "404.html",
            source: index.source,
          });
      },
    },
    {
      // Publishes Simplink's own KB as a static KB under <base>/simp, without the private sources sidecar.
      name: "publish-simp-kb",
      apply: "build",
      async closeBundle() {
        const {
          buildSimpIndex,
          formatSimpIndex,
          fsSource,
          SIMP_INDEX_FILE,
          SIMP_SOURCES_FILE,
        } = await import("@sontx/simplink-core");
        const target = path.join(outDir, "simp");
        await cp(kbDir, target, {
          recursive: true,
          filter: (source) =>
            path.relative(kbDir, source) !== SIMP_SOURCES_FILE &&
            !path.basename(source).startsWith("."),
        });
        const index = await buildSimpIndex(fsSource(target));
        await writeFile(
          path.join(target, SIMP_INDEX_FILE),
          formatSimpIndex(index),
        );
      },
    },
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: fileURLToPath(new URL("./src/routes", import.meta.url)),
      generatedRouteTree: fileURLToPath(
        new URL("./src/routeTree.gen.ts", import.meta.url),
      ),
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { outDir, emptyOutDir: true },
});

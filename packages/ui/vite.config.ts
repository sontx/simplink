import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: process.env.SIMPLINK_UI_BASE ?? "/",
  root: fileURLToPath(new URL("./web", import.meta.url)),
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
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: fileURLToPath(
        new URL("./web/src/routes", import.meta.url),
      ),
      generatedRouteTree: fileURLToPath(
        new URL("./web/src/routeTree.gen.ts", import.meta.url),
      ),
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./web/src", import.meta.url)) },
  },
  build: { outDir: "../dist", emptyOutDir: true },
});

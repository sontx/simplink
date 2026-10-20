import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { devtools } from "@tanstack/devtools-vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: fileURLToPath(new URL("./web", import.meta.url)),
  plugins: [
    devtools(),
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
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    proxy: { "/api": { target: "http://127.0.0.1:4321", changeOrigin: true } },
  },
});

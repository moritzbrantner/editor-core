import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const exampleDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(exampleDir, "../..");
const repositoryName = process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "editor-core";

export default defineConfig({
  base: process.env.GITHUB_PAGES === "true" ? `/${repositoryName}/` : "/",
  build: {
    emptyOutDir: true,
    outDir: resolve(exampleDir, "dist"),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@moenarch/editor-core/react",
        replacement: resolve(rootDir, "src/react.tsx"),
      },
      {
        find: "@moenarch/editor-core/tree",
        replacement: resolve(rootDir, "src/tree.ts"),
      },
      {
        find: "@moenarch/editor-core",
        replacement: resolve(rootDir, "src/index.ts"),
      },
    ],
  },
  root: exampleDir,
  server: {
    fs: {
      allow: [rootDir],
    },
  },
});

import tailwindcss from "@tailwindcss/vite";
import type { StorybookConfig } from "@storybook/react-vite";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";

const storybookDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(storybookDir, "..");

const config: StorybookConfig = {
  addons: ["@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  stories: ["../stories/**/*.stories.@(ts|tsx)"],
  viteFinal(baseConfig) {
    return mergeConfig(baseConfig, {
      plugins: [tailwindcss()],
      resolve: {
        alias: [
          {
            find: "@moritzbrantner/editor-core/react",
            replacement: resolve(rootDir, "src/react.tsx"),
          },
          {
            find: "@moritzbrantner/editor-core/tree",
            replacement: resolve(rootDir, "src/tree.ts"),
          },
          {
            find: "@moritzbrantner/editor-core",
            replacement: resolve(rootDir, "src/index.ts"),
          },
        ],
      },
    });
  },
};

export default config;

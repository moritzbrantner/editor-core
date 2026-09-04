import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.d.ts", "src/**/test-support.ts"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      provider: "v8",
      reporter: ["text", "html", "json"],
      reportsDirectory: "coverage",
      thresholds: {
        branches: 80,
        functions: 95,
        lines: 90,
        statements: 90,
      },
    },
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});

import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  expect: {
    timeout: 5000,
  },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  testDir: "./tests/e2e",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bun run example:preview -- --port ${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    url: baseURL,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

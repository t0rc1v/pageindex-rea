import { defineConfig, devices } from "@playwright/test";

/**
 * E2E runs against the offline mock API (`pnpm mock:api`), so it needs no key
 * and no network. It reuses the installed Chrome (`channel: "chrome"`) instead
 * of downloading a browser.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chrome", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: [
    {
      command: "node scripts/mock-pageindex-api.mjs 4319",
      url: "http://127.0.0.1:4319",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "npx next start -p 3100",
      url: "http://127.0.0.1:3100/chat",
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        PAGEINDEX_API_URL: "http://127.0.0.1:4319",
        PAGEINDEX_API_KEY: "test-key",
        OPENAI_API_KEY: "",
      },
    },
  ],
});

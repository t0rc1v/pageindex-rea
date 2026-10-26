import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright starts a separate process, so it does not see the env Next loads
 * from `.env.local` on its own. `@next/env` is the loader Next itself uses —
 * same precedence, same variable expansion — and `clerkSetup()` needs
 * `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` before any test runs.
 */
loadEnvConfig(process.cwd());

const AUTH_STATE = "e2e/.auth/user.json";

/**
 * E2E runs against the offline mock API (`pnpm mock:api`), so it needs no key
 * and no network. It reuses the installed Chrome (`channel: "chrome"`) instead
 * of downloading a browser.
 *
 * The `setup` project signs a test user in once and writes `storageState`; the
 * `chrome` project depends on it and starts already authenticated. That is why
 * the specs can `page.goto("/chat")` straight into a gated route.
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
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      // Same system Chrome as the specs: the setup project launches a browser
      // too, and the bundled Chromium was never downloaded by design.
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "chrome",
      use: { ...devices["Desktop Chrome"], channel: "chrome", storageState: AUTH_STATE },
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
    },
  ],
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
      // Never reuse: a server left over from a previous run serves the *old*
      // `.next` output, and if the build was replaced underneath it the app
      // answers with HTML error pages instead of failing loudly. Start fresh
      // from the current build every time.
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PAGEINDEX_API_URL: "http://127.0.0.1:4319",
        PAGEINDEX_API_KEY: "test-key",
        OPENAI_API_KEY: "",
      },
    },
  ],
});

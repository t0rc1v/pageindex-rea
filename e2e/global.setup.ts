import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

/**
 * Playwright has no session out of the box, so the whole suite signs in once
 * here and every test inherits the cookies through `storageState`.
 *
 * `clerkSetup()` must run in a *project* (not a function-based `globalSetup`):
 * it sets `CLERK_FAPI` and `CLERK_TESTING_TOKEN` in the runner's environment,
 * and Playwright only propagates those to the test projects declared as
 * dependencies.
 *
 * The account is a development-instance `+clerk_test` user created with
 * `clerk users create`. `clerk.signIn({ emailAddress })` mints a sign-in token
 * through the Backend API and spends it as a ticket, so no password or emailed
 * code is involved and the flow cannot be rate-limited by bot protection.
 */
const USER_EMAIL = process.env.E2E_CLERK_USER_EMAIL ?? "pageindex-e2e+clerk_test@example.com";
const STATE_PATH = "e2e/.auth/user.json";

setup.describe.configure({ mode: "serial" });

setup("clerk testing token", async () => {
  await clerkSetup();
});

setup("sign in the test user", async ({ page }) => {
  // `signIn` needs a page that already loaded Clerk — the sign-in route is the
  // only public one that does.
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: USER_EMAIL });

  // Prove the gate opened rather than trusting the cookie jar.
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat$/);

  // The suite writes real rows to the development database, so it starts from an
  // empty Recents; leftover conversations would leak into later assertions.
  await page.request.delete("/api/chats");

  await page.context().storageState({ path: STATE_PATH });
});

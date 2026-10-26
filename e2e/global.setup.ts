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

/**
 * A minimal, structurally valid PDF. The mock accepts anything with a `%PDF-`
 * header; using the real upload endpoint (rather than seeding Postgres) is what
 * makes this suite exercise registration, the ownership registry and the
 * document routes the way a real workspace does.
 */
const SAMPLE_PDF = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj",
    "2 0 obj<</Type /Pages /Kids [3 0 R] /Count 1>>endobj",
    "3 0 obj<</Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]>>endobj",
    "trailer<</Root 1 0 R>>",
    "%%EOF",
    "",
  ].join("\n"),
  "utf8",
);

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

  // Register the mock's document the same way a user would. Re-running is
  // harmless: the registry upserts on (tenant, pageindex_id).
  const uploaded = await page.request.post("/api/upload", {
    multipart: {
      file: {
        name: "Annual Report 2024.pdf",
        mimeType: "application/pdf",
        buffer: SAMPLE_PDF,
      },
    },
  });
  expect(uploaded.ok(), await uploaded.text()).toBeTruthy();

  // The display name is workspace state and a rename test may have changed it;
  // reset it so the chat specs assert on a known title.
  await page.request.patch("/api/docs/pi-mock-1", {
    data: { name: "Annual Report 2024.pdf" },
  });

  await page.context().storageState({ path: STATE_PATH });
});

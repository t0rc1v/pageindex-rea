import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * The reader's own conversation surface.
 *
 * Inverted from `/chat`: the document is the page and the chat is the panel, so
 * a citation has to turn the reader rather than open a viewer over it. These
 * cover both entry points (the composer starts a chat, the panel composer
 * continues it), the citation direction, and the document's chat list.
 *
 * Every test asks a different question: the chat's title is derived from the
 * first one, and the database is shared across the file.
 */
test.describe("document chat", () => {
  /** Ask from the reader and wait for the panel to take over. */
  async function askInReader(page: Page, question: string) {
    await page.goto("/doc/pi-mock-1");
    await page.getByLabel("Ask about this document").fill(question);
    await page.getByLabel("Send question").click();

    const panel = page.getByRole("complementary", { name: "Document chat" });
    await expect(panel).toBeVisible();
    return panel;
  }

  test("the reader composer starts a chat in the panel", async ({ page }) => {
    const question = "Summarize this document.";
    const panel = await askInReader(page, question);

    // The title and the bubble both read as the question, so match the whole
    // panel's text rather than a single node.
    await expect(panel).toContainText(question);
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toBeVisible({
      timeout: 30_000,
    });

    // A new chat is a new address, so the panel survives a reload.
    await expect(page).toHaveURL(/[?&]chat=/);
  });

  test("a reload reopens the chat in the panel", async ({ page }) => {
    const question = "Does this reader keep its chat?";

    // The conversation is written when its answer settles, exactly like `/chat`.
    // Waiting for that write is the difference between testing the reload and
    // testing the save.
    const saved = page.waitForResponse(
      (response) => response.request().method() === "PUT" && /\/api\/chats\//.test(response.url()),
    );

    await askInReader(page, question);
    await saved;

    await page.reload();

    // The chat id is in the URL, so the panel comes back with the transcript.
    const panel = page.getByRole("complementary", { name: "Document chat" });
    await expect(panel).toContainText(question);
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("the panel's composer continues the same chat", async ({ page }) => {
    const question = "Continue this conversation.";
    const panel = await askInReader(page, question);
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toBeVisible({
      timeout: 30_000,
    });

    await panel.getByLabel("Ask a follow-up").fill("And the main risk?");
    await panel.getByLabel("Send message").click();

    // Both questions are in one transcript: it continued, it did not start over.
    await expect(panel).toContainText(question);
    await expect(panel).toContainText("And the main risk?");
    // One citation number per answer: two answers, two "Citation 1" chips.
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toHaveCount(2, {
      timeout: 30_000,
    });
  });

  test("a citation turns the reader instead of opening a second panel", async ({ page }) => {
    const panel = await askInReader(page, "Where is the risk section?");
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toBeVisible({
      timeout: 30_000,
    });

    // A chip opens its preview; the preview is what navigates.
    await panel.getByRole("button", { name: /page 3/ }).first().click();
    const card = panel.getByRole("dialog", { name: "Citation details" });
    await expect(card).toContainText(/Page 3 of 3/);
    await card.getByRole("button", { name: /Open page/ }).click();

    await expect(page).toHaveURL(/[?&]page=3/);
    // The whole point of the inversion: the document is already on screen.
    await expect(page.getByLabel("Document viewer")).toHaveCount(0);
    await expect(panel).toBeVisible();
  });

  test("the page on screen is pinned, and a removed pin stays removed", async ({ page }) => {
    await page.goto("/doc/pi-mock-1?page=2");
    await page.getByLabel("Ask about this document").fill("What is on this page?");
    await page.getByLabel("Send question").click();

    const panel = page.getByRole("complementary", { name: "Document chat" });
    await expect(panel.getByLabel("Remove page 2 from context")).toBeVisible();
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toBeVisible({
      timeout: 30_000,
    });

    // Removing the chip means "not this page", not "until the next question".
    await panel.getByLabel("Remove page 2 from context").click();
    await expect(panel.getByLabel("Remove page 2 from context")).toHaveCount(0);

    await panel.getByLabel("Ask a follow-up").fill("Anything else here?");
    await panel.getByLabel("Send message").click();
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toHaveCount(2, {
      timeout: 30_000,
    });
    await expect(panel.getByLabel("Remove page 2 from context")).toHaveCount(0);

    // Turning the page retracts that, and the pin follows the reader.
    await page.getByLabel("Next page").click();
    await panel.getByLabel("Ask a follow-up").fill("And this page?");
    await panel.getByLabel("Send message").click();
    await expect(panel.getByLabel("Remove page 3 from context")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("the chat menu lists, renames and deletes this document's chats", async ({ page }) => {
    const question = "Keep this chat in the menu.";
    const panel = await askInReader(page, question);
    await expect(panel).toContainText(question);

    // The reader's menu, not the panel's, so closing first keeps it unambiguous.
    await panel.getByLabel("Close chat").click();
    await page.getByRole("button", { name: /^Chat/ }).click();

    const menu = page.getByRole("menu", { name: "Chats in this document" });
    await expect(menu.getByRole("menuitem", { name: new RegExp(question) })).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept("Risk review"));
    await menu.getByLabel(`Rename ${question}`).click();
    await expect(menu.getByRole("menuitem", { name: /Risk review/ })).toBeVisible();

    await menu.getByLabel(/^Delete Risk review/).click();
    await expect(menu.getByRole("menuitem", { name: /Risk review/ })).toHaveCount(0);
  });
});

/**
 * The narrow layout is a different contract: the panel covers the page, so a
 * citation has to put it away or it would hide the page it just opened.
 */
test.describe("document chat on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a citation closes the sheet so the page is visible", async ({ page }) => {
    await page.goto("/doc/pi-mock-1");
    await page.getByLabel("Ask about this document").fill("Where is the risk section?");
    await page.getByLabel("Send question").click();

    const panel = page.getByRole("complementary", { name: "Document chat" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: /^Citation 1:/ })).toBeVisible({
      timeout: 30_000,
    });

    await panel.getByRole("button", { name: /page 3/ }).first().click();
    await panel
      .getByRole("dialog", { name: "Citation details" })
      .getByRole("button", { name: /Open page/ })
      .click();

    await expect(page).toHaveURL(/[?&]page=3/);
    await expect(page.getByRole("complementary", { name: "Document chat" })).toHaveCount(0);
  });
});

import { expect, test } from "@playwright/test";

test.describe("conversation surface", () => {
  test("answers a question with tool steps, citations and sources", async ({ page }) => {
    await page.goto("/chat");
    await page.getByPlaceholder(/Ask a question/).fill("Summarize the key findings.");
    await page.getByLabel("Send message").click();

    // The tool step is a button labelled with the sentence it performed.
    const step = page.getByRole("button", { name: /Read pages/ });
    await expect(step).toBeVisible();

    // Expanding it reveals the fetched page text.
    await step.click();
    await expect(page.getByText("returned pages 3")).toBeVisible();

    // Raw I/O is available from the expanded step.
    await page.getByLabel("View raw input and output").first().click();
    await expect(page.getByText("Raw input and output")).toBeVisible();
    await page.getByLabel("Close raw view").click();

    // Sources carry counts, and expanding lists the document.
    const sources = page.getByRole("button", { name: /^Sources/ });
    await expect(sources).toContainText("references");
    await sources.click();
    await expect(page.getByText("Annual Report 2024.pdf").last()).toBeVisible();
  });

  test("regenerate keeps the previous answer behind a branch control", async ({ page }) => {
    await page.goto("/chat");
    await page.getByPlaceholder(/Ask a question/).fill("Summarize the key findings.");
    await page.getByLabel("Send message").click();

    const regenerate = page.getByLabel("Regenerate");
    await expect(regenerate).toBeVisible({ timeout: 30_000 });
    await regenerate.click();

    await expect(page.getByLabel("Previous branch")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Previous branch").locator("..")).toContainText("2/2");
  });

  test("citation opens a preview with Page N of M", async ({ page }) => {
    await page.goto("/chat");
    await page.getByPlaceholder(/Ask a question/).fill("Summarize the key findings.");
    await page.getByLabel("Send message").click();

    const chip = page.getByRole("button", { name: /^Citation 1:/ });
    await expect(chip).toBeVisible({ timeout: 30_000 });
    await chip.click();

    const card = page.getByRole("dialog", { name: "Citation details" });
    await expect(card).toContainText(/Page \d of 3/);
    await expect(card).toContainText("Text block");
  });

  test("appearance switches the transcript and theme", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Sans", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-transcript", "sans");
  });
});

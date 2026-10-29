import { expect, test } from "./fixtures";

/**
 * The reader had no end-to-end coverage at all, which is how a hydration bug
 * lived on every page that shows a figure: React recovered by re-rendering, the
 * screenshot looked right, and nothing in the suite opened `/doc/[docId]`.
 *
 * Page 1 of the mock document is deliberately representative — heading, table,
 * table text and `![Figure 1](img-1.jpeg)`, which `markdown.tsx` renders as a
 * `<figure>`. The fixture's hydration assertion is what turns a regression there
 * into a failing test.
 */
test.describe("document reader", () => {
  test("renders a page with prose, a table and a figure", async ({ page }) => {
    await page.goto("/doc/pi-mock-1");

    await expect(page.getByRole("heading", { name: "Financial Highlights" })).toBeVisible();
    await expect(page.getByText("Revenue grew 12% to $4.2bn")).toBeVisible();

    // The table is OCR markdown rendered through remark-gfm.
    await expect(page.getByRole("cell", { name: "Cloud" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "1.6" })).toBeVisible();

    // And the figure is served through the presigned-image proxy, not upstream.
    const figure = page.getByRole("img", { name: "Figure 1" });
    await expect(figure).toBeVisible();
    await expect(figure).toHaveAttribute("src", /^\/api\/docs\/pi-mock-1\/image\/img-1\.jpeg/);

    // The invariant `lib/markdown-blocks.ts` exists for: markdown gives an image
    // its own paragraph, and our override turns that image into a <figure>, which
    // HTML forbids inside <p>. A production React build stays silent about it —
    // it re-renders and keeps the invalid tree — so the DOM is the only witness.
    await expect(page.locator("p figure, p div")).toHaveCount(0);
  });

  test("the outline lists the tree and opens a page", async ({ page }) => {
    await page.goto("/doc/pi-mock-1");

    // The outline is shown by default on `lg`; the header button collapses it.
    const outline = page.getByRole("navigation", { name: "Document outline" });
    await expect(outline).toBeVisible();
    await expect(outline.getByRole("button", { name: /Financial Highlights/ })).toBeVisible();

    await outline.getByRole("button", { name: /Risk Factors/ }).click();

    await expect(page.getByText("Supply concentration remains the principal")).toBeVisible();
  });
});

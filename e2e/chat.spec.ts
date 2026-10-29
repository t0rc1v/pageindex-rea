import { randomUUID } from "node:crypto";

import { type Locator, type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

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

    // Regenerating stays available after a variant lands: variants accumulate.
    for (const expected of ["2/2", "3/3"]) {
      const regenerate = page.getByLabel("Regenerate");
      await expect(regenerate).toBeVisible({ timeout: 30_000 });
      await regenerate.click();
      await expect(page.getByLabel("Previous branch").locator("..")).toContainText(expected, {
        timeout: 30_000,
      });
    }
    await expect(page.getByLabel("Regenerate")).toBeVisible();
  });

  test("editing a question keeps the previous answer as a variant", async ({ page }) => {
    await page.goto("/chat");
    await page.getByPlaceholder(/Ask a question/).fill("Summarize the key findings.");
    await page.getByLabel("Send message").click();
    await expect(page.getByLabel("Regenerate")).toBeVisible({ timeout: 30_000 });

    await page.getByLabel("Edit message").click();
    // The inline editor is the first textarea; the composer sits under it.
    await page.locator("textarea").first().fill("Which risks does the report name?");
    await page.getByRole("button", { name: /Save & resend/ }).click();

    // Both sides of the exchange keep the old wording behind a branch control.
    const questionBranch = page.getByLabel("Previous question").locator("..");
    await expect(questionBranch).toContainText("2/2", { timeout: 30_000 });
    await expect(page.locator("p.bg-bubble").first()).toContainText("Which risks");

    await page.getByLabel("Previous question").click();
    await expect(page.locator("p.bg-bubble").first()).toContainText("Summarize the key findings.");

    await page.getByLabel("Next question").click();
    await expect(page.locator("p.bg-bubble").first()).toContainText("Which risks");
    await expect(page.getByLabel("Regenerate")).toBeVisible();

    // The branch control on the answer counts only this wording's answers.
    await expect(page.getByLabel("Previous branch")).toHaveCount(0);
    await page.getByLabel("Regenerate").click();
    await expect(page.getByLabel("Previous branch").locator("..")).toContainText("2/2", {
      timeout: 30_000,
    });
    await page.getByLabel("Previous question").click();
    await expect(page.getByLabel("Previous branch")).toHaveCount(0);
    await page.getByLabel("Next question").click();
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

  /**
   * The preview must not depend on the citations frame having landed: the chip is
   * on screen as soon as its tag streams in, and the frame (which carries the
   * document id) arrives after the text finishes. The mock can hold that frame
   * back on request, so this is the deterministic version of a race that used to
   * surface as "outside the current scope" for the document on screen.
   */
  test("a citation clicked mid-answer already opens its page", async ({ page }) => {
    await page.goto("/chat");
    await page.getByPlaceholder(/Ask a question/).fill("Cite later: summarise the risks.");
    await page.getByLabel("Send message").click();

    await page.getByRole("button", { name: /^Citation 1:/ }).click();

    const card = page.getByRole("dialog", { name: "Citation details" });
    await expect(card).toBeVisible();
    await expect(card).not.toContainText("outside the current scope");
    await expect(card).toContainText(/Page \d of 3/);
  });

  test("citation preview hugs its marker: same gap either side, follows scroll", async ({ page }) => {
    await page.goto("/chat");
    await page.getByPlaceholder(/Ask a question/).fill("Summarize the key findings.");
    await page.getByLabel("Send message").click();

    const chip = page.getByRole("button", { name: /^Citation 1:/ });
    await expect(chip).toBeVisible({ timeout: 30_000 });
    const card = page.getByRole("dialog", { name: "Citation details" });

    // The card is placed from the marker's rect at the moment the preview
    // opens, and the marker moves while the transcript settles, so the rect has
    // to be captured from the same event the card saw.
    await page.evaluate(() => {
      const remember = (event: Event) => {
        const marker = (event.target as HTMLElement).closest<HTMLElement>(
          'button[aria-label^="Citation "], button[title*="— page"]',
        );
        if (!marker) return;
        const rect = marker.getBoundingClientRect();
        (window as unknown as { __anchor?: { top: number; bottom: number } }).__anchor = {
          top: rect.top,
          bottom: rect.bottom,
        };
      };
      // Hovering opens the card, and on these markers the browser often fires
      // no click at all (the card closes on mousedown, so down and up disagree),
      // so remember the rect from whichever event the card opened on.
      for (const type of ["mouseover", "click", "focusin"]) {
        document.addEventListener(type, remember, true);
      }
    });

    const open = async (marker: Locator) => {
      await page.evaluate(() => {
        (window as unknown as { __anchor?: unknown }).__anchor = undefined;
      });
      await page.mouse.move(0, 0);
      await marker.click();
      const anchor = await page.evaluate(
        () => (window as unknown as { __anchor?: { top: number; bottom: number } }).__anchor,
      );
      if (!anchor) throw new Error("the marker was never pointed at");
      await expect(card).toContainText(/Page \d of 3/);
      return anchor;
    };

    // Below the marker the gap is unconditional.
    const first = await open(chip);
    await expect.poll(async () => Math.round((await card.boundingBox())!.y - first.bottom)).toBe(8);
    // Opening the preview must not move the answer itself (it used to remount
    // the markdown subtree, which shifted everything by a diagram's height).
    await expect.poll(async () => Math.round((await chip.boundingBox())!.y)).toBe(Math.round(first.top));

    // Scrolling moves the marker, so the card follows it instead of being left
    // behind on unrelated text.
    const before = (await card.boundingBox())!;
    await page.evaluate(() => {
      const marker = document.querySelector('button[aria-label^="Citation 1:"]') as HTMLElement;
      const scroller = marker.closest("div.overflow-y-auto") as HTMLElement;
      scroller.scrollTop += 24;
    });
    await expect.poll(async () => Math.round((await card.boundingBox())!.y - before.y)).toBe(-24);
    await expect
      .poll(async () => {
        const box = await card.boundingBox();
        const marker = await chip.boundingBox();
        return box && marker ? Math.round(box.y - (marker.y + marker.height)) : Number.NaN;
      })
      .toBe(8);

    // Once the marker is gone there is nothing to point at, so the card goes.
    // The expanded Sources block makes the transcript long enough for it to
    // scroll clean off the top.
    await page.getByLabel("Close citation preview").click();
    await page.getByRole("button", { name: /^Sources/ }).click();
    await open(chip);
    await page.evaluate(() => {
      const marker = document.querySelector('button[aria-label^="Citation 1:"]') as HTMLElement;
      const scroller = marker.closest("div.overflow-y-auto") as HTMLElement;
      scroller.scrollTop = scroller.scrollHeight;
    });
    await expect.poll(async () => Math.round((await chip.boundingBox())!.y)).toBeLessThan(0);
    await expect(card).toHaveCount(0);

    // The last citation sits at the bottom of the transcript, so a card taller
    // than the room below it has to flip above. Give the mock page art a tall
    // aspect to force that, then check the gap above is the same 8px — it used
    // to be measured against a guessed card height, which left the flipped
    // card tens of px further from the marker than the card below it ever was.
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.route(/\/render\/page-\d+\.png/, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="300"><rect width="100" height="300" fill="#eee"/></svg>',
      }),
    );
    const lastPage = page.getByRole("button", { name: "p.3", exact: true }).last();
    const last = await open(lastPage);
    await expect(card).toContainText(/Page 3 of 3/);

    await expect
      .poll(async () => {
        const live = await card.boundingBox();
        return live ? Math.round(last.top - (live.y + live.height)) : Number.NaN;
      })
      .toBe(8);
    const settled = await card.boundingBox();
    expect(settled!.y).toBeLessThan(last.top);
    expect(settled!.y).toBeGreaterThanOrEqual(11);
    expect(settled!.y + settled!.height).toBeLessThanOrEqual(900);
  });

  test("appearance switches the transcript and theme", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Dark", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: "Sans", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-transcript", "sans");
  });

  /**
   * The one test that proves the Postgres round trip: everything else could pass
   * on in-memory state alone. It waits for the PUT that settles the run, reloads
   * the same URL, and expects the transcript to come back from `/api/chats/:id`.
   */
  test("a conversation survives a reload", async ({ page }) => {
    await page.goto("/chat");

    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === "PUT" &&
        /^\/api\/chats\/[^/]+$/.test(new URL(response.url()).pathname),
      { timeout: 60_000 },
    );

    await page.getByPlaceholder(/Ask a question/).fill("Summarize the key findings.");
    await page.getByLabel("Send message").click();
    await expect(page.getByLabel("Regenerate")).toBeVisible({ timeout: 30_000 });
    await saved;

    const chatUrl = new URL(page.url());
    expect(chatUrl.pathname).toMatch(/^\/chat\/[0-9a-f-]{36}$/);

    await page.reload();

    // Scope to the transcript: earlier tests leave same-titled chats in Recents.
    const transcript = page.getByRole("main");
    await expect(transcript.getByText("Summarize the key findings.")).toBeVisible();
    await expect(transcript.getByLabel("Regenerate")).toBeVisible({ timeout: 30_000 });
    await transcript.getByRole("button", { name: /^Sources/ }).click();
    await expect(page.getByText("Annual Report 2024.pdf").last()).toBeVisible();
  });
});

/**
 * Ownership, not existence.
 *
 * The PageIndex account is shared by every tenant, and the mock serves a second
 * document (`Acquisition Memo.pdf`) that this workspace never claimed. "The
 * upstream will return it" must not be enough to read it.
 */
test.describe("document ownership", () => {
  test("the library lists only documents this workspace registered", async ({ page }) => {
    const response = await page.request.get("/api/docs?limit=50");
    expect(response.ok()).toBeTruthy();

    const body = (await response.json()) as { documents: Array<{ id: string; name: string }> };
    const names = body.documents.map((document) => document.name);
    expect(names).toContain("Annual Report 2024.pdf");
    expect(names).not.toContain("Acquisition Memo.pdf");
  });

  test("an unregistered document id is not readable", async ({ page }) => {
    for (const path of [
      "/api/docs/pi-mock-2",
      "/api/docs/pi-mock-2/tree",
      "/api/docs/pi-mock-2/pages?from=1&to=1",
      "/api/docs/pi-mock-2/image?page=1",
      "/api/docs/pi-mock-2/block/p1_text_2",
    ]) {
      const response = await page.request.get(path);
      expect(response.status(), path).toBe(404);
    }
  });

  test("a chat cannot be scoped to a document the workspace does not own", async ({ page }) => {
    const response = await page.request.post("/api/chat", {
      data: {
        messages: [{ role: "user", content: "What does the memo say?" }],
        docIds: ["pi-mock-2"],
      },
    });

    expect(response.status()).toBe(404);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/available in this workspace/i);
  });
});

/**
 * Two lists, one column.
 *
 * `origin_doc_id` is what decides whether a conversation belongs to Recents or
 * to the document it was started in; Recents is the default and `?docId=` swaps
 * lists. The reader does not create chats yet, so these exercise the contract
 * directly — the same calls its Chat menu will make.
 */
test.describe("conversation origins", () => {
  const DOC = "pi-mock-1";
  const DOC_NAME = "Annual Report 2024.pdf";

  /** PUT a conversation the way the document reader would. */
  async function putChat(page: Page, id: string, originDocId?: string) {
    const response = await page.request.put(`/api/chats/${id}`, {
      data: {
        title: "About the report",
        scopeDocs: [{ id: DOC, name: DOC_NAME }],
        ...(originDocId ? { originDocId } : {}),
        turns: [],
      },
    });
    expect(response.status()).toBe(204);
  }

  async function listed(page: Page, path: string, id: string) {
    const response = await page.request.get(path);
    expect(response.ok(), path).toBeTruthy();
    const body = (await response.json()) as { chats: Array<{ id: string; originDocId?: string }> };
    return body.chats.find((chat) => chat.id === id);
  }

  test("a document chat is listed by its document, never in Recents", async ({ page }) => {
    const id = randomUUID();
    await putChat(page, id, DOC);

    const scoped = await listed(page, `/api/chats?docId=${encodeURIComponent(DOC)}`, id);
    expect(scoped?.originDocId).toBe(DOC);

    expect(await listed(page, "/api/chats", id)).toBeUndefined();

    const single = await page.request.get(`/api/chats/${id}`);
    const body = (await single.json()) as { chat: { originDocId?: string } };
    expect(body.chat.originDocId).toBe(DOC);
  });

  test("origin is set once and never rewritten by a later save", async ({ page }) => {
    const id = randomUUID();
    await putChat(page, id, DOC);

    // A save from a surface that does not know where the chat came from must not
    // be able to move it between lists.
    await putChat(page, id);

    expect(await listed(page, `/api/chats?docId=${encodeURIComponent(DOC)}`, id)).toBeDefined();
    expect(await listed(page, "/api/chats", id)).toBeUndefined();
  });

  test("a document this workspace does not own cannot become an origin", async ({ page }) => {
    const response = await page.request.put(`/api/chats/${randomUUID()}`, {
      data: {
        title: "About the memo",
        scopeDocs: [],
        // The mock serves it; this workspace never claimed it.
        originDocId: "pi-mock-2",
        turns: [],
      },
    });

    expect(response.status()).toBe(400);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/document is not available/i);
  });

  test("a malformed document filter is a 400, not a 500", async ({ page }) => {
    const response = await page.request.get(`/api/chats?docId=${"x".repeat(201)}`);
    expect(response.status()).toBe(400);
  });
});

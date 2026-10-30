import { randomUUID } from "node:crypto";

import { type Page } from "@playwright/test";

import { expect, test } from "./fixtures";

/**
 * Folders and the library listing are workspace data now, not PageIndex data.
 *
 * The mock upstream exposes a single folder ("folder-a") and two documents; none
 * of that may leak into a tenant that did not create it.
 */

const PDF = Buffer.from(
  ["%PDF-1.4", "1 0 obj<</Type /Catalog>>endobj", "trailer<</Root 1 0 R>>", "%%EOF", ""].join(
    "\n",
  ),
  "utf8",
);

test.describe("workspace folders", () => {
  test("a folder is local to the workspace and filters the library", async ({ page }) => {
    const name = `E2E ${Date.now()}`;

    const created = await page.request.post("/api/folders", { data: { name } });
    expect(created.status(), await created.text()).toBe(200);
    const folder = (await created.json()) as { id: string; name: string; file_count: number };
    expect(folder.name).toBe(name);
    expect(folder.file_count).toBe(0);

    try {
      await assertFolderIsolation(page, folder);
    } finally {
      // Leave the workspace as it was found: the folder id is unique per run, but
      // the row would otherwise accumulate in a long-lived dev database.
      const removed = await page.request.delete(`/api/folders/${folder.id}`);
      expect(removed.ok(), await removed.text()).toBeTruthy();
    }
  });

  test("uploading into a folder this workspace does not own is refused", async ({ page }) => {
    const response = await page.request.post("/api/upload", {
      multipart: {
        file: { name: "Report.pdf", mimeType: "application/pdf", buffer: PDF },
        folder_id: "00000000-0000-0000-0000-000000000000",
      },
    });

    expect(response.status()).toBe(404);
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/folder does not exist/i);
  });

  test("deleting an unknown folder answers 404", async ({ page }) => {
    // A well-formed id that belongs to nobody: the route must not leak whether it
    // exists. (Tenant scoping is the same check that answers 404 for another
    // workspace's folder.)
    const removed = await page.request.delete(
      "/api/folders/00000000-0000-0000-0000-000000000000",
    );
    expect(removed.status()).toBe(404);
  });

  test("folders can be renamed and deleted from the workspace panel", async ({ page }) => {
    const name = `E2E Rename ${Date.now()}`;
    const renamed = `${name} renamed`;

    const created = await page.request.post("/api/folders", { data: { name } });
    expect(created.status(), await created.text()).toBe(200);
    const folder = (await created.json()) as { id: string };

    try {
      await page.goto("/library");

      await expect(page.getByRole("button", { name: `Open ${name}` })).toBeVisible();

      await page.getByRole("button", { name: `Actions for ${name}` }).click();
      await page.getByRole("menuitem", { name: "Rename" }).click();
      await page.getByLabel("Folder name").fill(renamed);
      await page.getByRole("button", { name: "Save", exact: true }).click();

      await expect(page.getByRole("button", { name: `Open ${renamed}` })).toBeVisible();

      await page.getByRole("button", { name: `Actions for ${renamed}` }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();

      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Delete folder" }).click();

      await expect(page.getByRole("button", { name: `Open ${renamed}` })).toHaveCount(0);

      const listed = await page.request.get("/api/folders");
      const { folders } = (await listed.json()) as { folders: Array<{ id: string }> };
      expect(folders.map((item) => item.id)).not.toContain(folder.id);
    } finally {
      await page.request.delete(`/api/folders/${folder.id}`);
    }
  });

  test("the library does not page through upstream documents", async ({ page }) => {
    // The mock lists two documents; only the registered one may appear, and the
    // total must come from the registry rather than the upstream page size.
    const response = await page.request.get("/api/docs?limit=200");
    const body = (await response.json()) as {
      documents: Array<{ id: string; name: string }>;
      total: number;
    };

    expect(body.documents.map((document) => document.id)).not.toContain("pi-mock-2");
    expect(body.total).toBe(body.documents.length);
  });
});

async function assertFolderIsolation(page: Page, folder: { id: string }) {
  const listed = await page.request.get("/api/folders");
  const { folders } = (await listed.json()) as { folders: Array<{ id: string; name: string }> };
  expect(folders.map((item) => item.id)).toContain(folder.id);

  // Empty folder ⇒ empty page, and the unfiled scope still holds the document
  // the setup registered.
  const inFolder = await page.request.get(`/api/docs?folderId=${folder.id}`);
  const folderBody = (await inFolder.json()) as { total: number };
  expect(folderBody.total).toBe(0);

  const unfiled = await page.request.get("/api/docs?folderId=root");
  const unfiledBody = (await unfiled.json()) as { documents: Array<{ name: string }> };
  expect(unfiledBody.documents.map((document) => document.name)).toContain(
    "Annual Report 2024.pdf",
  );
}

test.describe("mobile library", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the workspaces drawer is reachable from the header", async ({ page }) => {
    await page.goto("/library");

    await page.getByRole("button", { name: "Open workspaces" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("button", { name: "All documents" })).toBeVisible();

    await sheet.getByRole("button", { name: "Unfiled" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("destructive confirmations", () => {
  // Cancel only: other library tests need the fixture document, and the shared
  // ConfirmProvider's true path is covered by the conversation clear below.
  test("document delete asks first, and Cancel keeps the document", async ({ page }) => {
    const name = "Annual Report 2024.pdf";

    await page.goto("/library");
    const card = page.getByRole("main").getByText(name).first();
    await expect(card).toBeVisible();
    await card.hover();

    await page.getByRole("button", { name: "Delete document" }).first().click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: `Delete “${name}”?` }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    // The confirm never resolved true, so the registry still owns the document.
    const listed = await page.request.get("/api/docs?limit=200");
    const body = (await listed.json()) as { documents: Array<{ id: string }> };
    expect(body.documents.map((document) => document.id)).toContain("pi-mock-1");
  });

  // Deleting every chat is safe here: global.setup clears Recents before each
  // run, and no later spec depends on an earlier test's conversation.
  test("clearing conversations asks first, then clears them", async ({ page }) => {
    const chatId = randomUUID();
    const created = await page.request.put(`/api/chats/${chatId}`, {
      data: {
        title: "Confirmation check",
        createdAt: Date.now(),
        scopeDocs: [],
        turns: [],
      },
    });
    expect(created.status(), await created.text()).toBe(204);

    await page.goto("/settings");

    const clear = page.getByRole("button", { name: "Clear conversations" });
    await expect(clear).toBeEnabled();
    await clear.click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Delete all conversations?" }),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);

    const kept = await page.request.get("/api/chats");
    const { chats: keptChats } = (await kept.json()) as { chats: Array<{ id: string }> };
    expect(keptChats.map((chat) => chat.id)).toContain(chatId);

    await clear.click();
    await expect(dialog).toBeVisible();
    const cleared = page.waitForResponse(
      (response) =>
        response.request().method() === "DELETE" &&
        new URL(response.url()).pathname === "/api/chats",
    );
    await dialog.getByRole("button", { name: "Delete conversations" }).click();
    const clearedResponse = await cleared;
    expect(clearedResponse.ok(), `DELETE /api/chats → ${clearedResponse.status()}`).toBeTruthy();

    await expect(page.getByText("No conversations yet.")).toBeVisible();
    const listed = await page.request.get("/api/chats");
    const { chats } = (await listed.json()) as { chats: Array<{ id: string }> };
    expect(chats).toEqual([]);
  });
});

test.describe("renaming", () => {
  const RENAMED = "Board Pack 2025.pdf";
  const UPSTREAM = "Annual Report 2024.pdf";

  test("stays local and reaches citations and sources", async ({ page }) => {
    const patched = await page.request.patch("/api/docs/pi-mock-1", { data: { name: RENAMED } });
    expect(patched.status(), await patched.text()).toBe(200);

    try {
      // The library shows the workspace's name…
      const listed = await page.request.get("/api/docs?limit=200");
      const library = (await listed.json()) as { documents: Array<{ name: string }> };
      expect(library.documents.map((document) => document.name)).toContain(RENAMED);

      // …while the upstream document is untouched. The mock requires the same
      // api_key every other caller sends.
      const upstream = await page.request.get("http://127.0.0.1:4319/docs/", {
        headers: { api_key: "test-key" },
      });
      const upstreamBody = (await upstream.json()) as { documents: Array<{ name: string }> };
      expect(upstreamBody.documents.map((document) => document.name)).toContain(UPSTREAM);

      // The citations frame carries the display name, not the upstream one.
      const stream = await page.request.post("/api/chat", {
        data: {
          messages: [{ role: "user", content: "Summarize the key findings." }],
          docIds: ["pi-mock-1"],
        },
      });
      const raw = await stream.text();
      const citations = raw
        .split("\n\n")
        .map((frame) => frame.split("\n").find((line) => line.startsWith("data:")))
        .filter((line): line is string => Boolean(line))
        .map((line) => JSON.parse(line.slice(5)) as { type: string; citations?: Array<{ document: string }> })
        .filter((event) => event.type === "citations")
        .flatMap((event) => event.citations ?? [])
        .map((citation) => citation.document);

      expect(citations.length).toBeGreaterThan(0);
      expect(citations).toContain(RENAMED);
      expect(citations).not.toContain(UPSTREAM);

      // And the transcript renders that name in Sources.
      await page.goto("/chat");
      await page.getByPlaceholder(/Ask a question/).fill("Summarize the key findings.");
      await page.getByLabel("Send message").click();
      const sources = page.getByRole("main").getByRole("button", { name: /^Sources/ });
      await expect(sources).toBeVisible({ timeout: 30_000 });
      await sources.click();
      await expect(page.getByRole("main").getByText(RENAMED).first()).toBeVisible();
    } finally {
      const restored = await page.request.patch("/api/docs/pi-mock-1", {
        data: { name: UPSTREAM },
      });
      expect(restored.ok(), await restored.text()).toBeTruthy();
    }
  });
});

/**
 * The policy is enforced, not just advertised: `e2e/fixtures.ts` fails any test
 * whose page reports a CSP violation, and this pins the directives that matter.
 */
test("serves a content security policy", async ({ page }) => {
  const response = await page.request.get("/chat");
  expect(response.ok()).toBeTruthy();

  const csp = response.headers()["content-security-policy"];
  expect(csp, "missing Content-Security-Policy header").toBeTruthy();

  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  // Presigned page renders are only reachable if the bucket host is allowed.
  expect(csp).toContain("https://*.amazonaws.com");
  // The production build must not need eval.
  expect(csp).not.toContain("'unsafe-eval'");
});

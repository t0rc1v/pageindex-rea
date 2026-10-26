import { expect, test } from "@playwright/test";

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

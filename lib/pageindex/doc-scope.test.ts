import { describe, expect, it } from "vitest";

import {
  MCP_READ_TOOLS,
  docNameArguments,
  normalizeDocName,
  toolCallAllowed,
} from "./doc-scope";

/**
 * The MCP endpoint is account-wide, so this allowlist is the only thing standing
 * between one tenant's prompt and every other tenant's documents.
 */
describe("MCP tool scope", () => {
  it("keeps enumerating tools out of the surface", () => {
    for (const tool of [
      "browse_documents",
      "search_documents",
      "get_folder_structure",
      "get_document_image",
      "remove_document",
    ]) {
      expect(MCP_READ_TOOLS.has(tool)).toBe(false);
    }
  });

  it("allows the read tools that require a document name", () => {
    expect([...MCP_READ_TOOLS].sort()).toEqual([
      "get_document",
      "get_document_structure",
      "get_metadata_schema",
      "get_page_content",
    ]);
  });

  it("finds document names in the argument shapes the server uses", () => {
    expect(docNameArguments({ doc_name: "Annual Report.pdf" })).toEqual(["Annual Report.pdf"]);
    expect(docNameArguments({ doc_names: ["a.pdf", "b.pdf"] })).toEqual(["a.pdf", "b.pdf"]);
    expect(docNameArguments({ document_name: "c.pdf" })).toEqual(["c.pdf"]);
    expect(docNameArguments({ docName: "d.pdf" })).toEqual(["d.pdf"]);
    // Not a document name — must not be mistaken for one.
    expect(docNameArguments({ pages: "1-3", folder_id: "f1" })).toEqual([]);
  });

  it("matches names case- and whitespace-insensitively", () => {
    const allowed = new Set([normalizeDocName("Annual Report 2024.pdf")]);
    expect(toolCallAllowed({ doc_name: " annual report 2024.PDF " }, allowed)).toEqual({
      allowed: true,
    });
  });

  it("refuses any other document, including a sibling tenant's", () => {
    const allowed = new Set([normalizeDocName("Annual Report 2024.pdf")]);
    expect(toolCallAllowed({ doc_name: "Acquisition Memo.pdf" }, allowed)).toEqual({
      allowed: false,
      name: "Acquisition Memo.pdf",
    });
    expect(
      toolCallAllowed({ doc_names: ["Annual Report 2024.pdf", "Acquisition Memo.pdf"] }, allowed),
    ).toEqual({ allowed: false, name: "Acquisition Memo.pdf" });
  });

  it("refuses everything when the tenant owns nothing", () => {
    expect(toolCallAllowed({ doc_name: "Annual Report 2024.pdf" }, new Set())).toEqual({
      allowed: false,
      name: "Annual Report 2024.pdf",
    });
    // Tools without a document argument stay callable, but read no content.
    expect(toolCallAllowed({ folder_id: "f1" }, new Set())).toEqual({ allowed: true });
  });
});

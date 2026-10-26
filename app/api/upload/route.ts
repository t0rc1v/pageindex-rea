import { submitDocument } from "@/lib/pageindex/client";
import { registerUploadResult } from "@/lib/server/documents";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { rateLimit, rateLimited } from "@/lib/server/rate-limit";
import { requireTenant } from "@/lib/server/tenant";

const MAX_BYTES = 50 * 1024 * 1024;

/**
 * Formats the product accepts. `.zip` is a bundle: the Cloud API expands it and
 * rebuilds the folder tree, which is how a whole data room goes up at once.
 */
export const ACCEPTED_EXTENSIONS = [
  ".pdf",
  ".docx",
  ".doc",
  ".pptx",
  ".ppt",
  ".csv",
  ".md",
  ".markdown",
  ".txt",
  ".zip",
] as const;

/** Container the bytes actually are, inferred from the header. */
type Container = "pdf" | "zip" | "ole" | "text" | "unknown";

const EXPECTED_CONTAINER: Record<string, Container> = {
  ".pdf": "pdf",
  ".docx": "zip",
  ".pptx": "zip",
  ".zip": "zip",
  ".doc": "ole",
  ".ppt": "ole",
  ".csv": "text",
  ".md": "text",
  ".markdown": "text",
  ".txt": "text",
};

/**
 * Trust the bytes, not the extension: browsers happily rename anything to .pdf,
 * and a mislabelled upload costs an indexing run to discover.
 */
async function sniffContainer(file: File): Promise<Container> {
  const head = new Uint8Array(await file.slice(0, 512).arrayBuffer());
  if (head.length === 0) return "unknown";
  const startsWith = (bytes: number[]) => bytes.every((byte, index) => head[index] === byte);
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06])) {
    return "zip"; // OOXML and .zip
  }
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0])) return "ole"; // legacy Office
  for (const byte of head) if (byte === 0) return "unknown";
  return "text";
}

function extensionOf(name: string): string {
  const match = name.toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : "";
}

/**
 * POST /api/upload — multipart pass-through to `POST /doc/`.
 *
 * Indexing options sent with every upload (the Cloud API accepts them as form
 * fields):
 *   if_add_node_summary=yes      outline tooltips get model-written summaries
 *   if_add_doc_description=yes   the library shows a one-line description
 *   if_add_node_text=no          node text is fetched per page instead
 *   if_retrieval=true            keep the document retrieval-ready
 *   beta_headers=[...]           PAGEINDEX_BETA_HEADERS, default block_reference
 *                                (block ids + bboxes for block-level citations)
 *
 * The document is processed asynchronously: the response carries a doc_id and
 * the library polls status until it reaches `completed`.
 */
export async function POST(request: Request) {
  const { tenantId, userId } = await requireTenant();

  // A 50 MB upload plus upstream indexing is the costliest call in the app.
  const verdict = await rateLimit(`upload:${userId}`, 20, 3600);
  if (!verdict.allowed) return rateLimited(verdict);

  try {
    const incoming = await request.formData();
    const file = incoming.get("file");

    if (!(file instanceof File)) {
      return jsonResponse(
        { error: "Attach a file as the `file` field.", code: "INTERNAL", status: 400 },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return jsonResponse(
        {
          error: `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit for this app is 50 MB.`,
          code: "INTERNAL",
          status: 413,
        },
        { status: 413 },
      );
    }

    const extension = extensionOf(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
      return jsonResponse(
        {
          error: `Unsupported format "${extension || file.name}". Upload ${ACCEPTED_EXTENSIONS.join(", ")}.`,
          code: "INTERNAL",
          status: 415,
        },
        { status: 415 },
      );
    }

    const expected = EXPECTED_CONTAINER[extension];
    const actual = await sniffContainer(file);
    if (expected && actual !== "unknown" && expected !== actual) {
      return jsonResponse(
        {
          error: `“${file.name}” does not look like ${extension} (detected ${actual}). Rename it or re-export the file.`,
          code: "INTERNAL",
          status: 415,
        },
        { status: 415 },
      );
    }

    const form = new FormData();
    form.set("file", file, file.name);
    form.set("if_add_node_id", "yes");
    form.set("if_add_node_summary", "yes");
    form.set("if_add_doc_description", "yes");
    form.set("if_add_node_text", "no");
    form.set("if_retrieval", "true");

    const folderId = incoming.get("folder_id");
    if (typeof folderId === "string" && folderId && folderId !== "all") {
      form.set("folder_id", folderId);
    }

    const metadata = incoming.get("metadata");
    if (typeof metadata === "string" && metadata.trim()) {
      form.set("metadata", metadata);
    }

    const betaHeaders = (process.env.PAGEINDEX_BETA_HEADERS ?? "block_reference")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value && value.toLowerCase() !== "none");
    if (betaHeaders.length > 0) {
      form.set("beta_headers", JSON.stringify(betaHeaders));
    }

    const result = await submitDocument(form);

    // The registry row is what makes the document visible, and what makes every
    // later docId check pass. Failing here would leave an indexed file no tenant
    // can reach, so it is surfaced instead of swallowed.
    try {
      await registerUploadResult(tenantId, userId, result);
    } catch (error) {
      console.error("registerUploadResult", error);
      return jsonResponse(
        {
          error:
            "The file was indexed but could not be registered to this workspace. Run `pnpm db:claim` to attach it.",
          code: "INTERNAL",
          status: 500,
        },
        { status: 500 },
      );
    }

    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}

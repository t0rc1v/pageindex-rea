import { submitDocument } from "@/lib/pageindex/client";
import { errorResponse, jsonResponse } from "@/lib/server/http";

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

    return jsonResponse(await submitDocument(form));
  } catch (error) {
    return errorResponse(error);
  }
}

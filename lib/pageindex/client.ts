import "server-only";

import type {
  BlockResponse,
  DocumentListResponse,
  FolderListResponse,
  OcrResponse,
  PageImageResponse,
  PageIndexDocument,
  PageIndexFolder,
  TreeResponse,
} from "./types";

/**
 * Server-only PageIndex Cloud client.
 *
 * The Cloud API authenticates with a bare `api_key` header (not
 * `Authorization: Bearer`), which is why every call goes through this module
 * from Route Handlers instead of the browser: the key must never reach the
 * client bundle.
 */

export const PAGEINDEX_API_URL = (
  process.env.PAGEINDEX_API_URL ?? "https://api.pageindex.ai"
).replace(/\/+$/, "");

export function hasApiKey(): boolean {
  return Boolean(process.env.PAGEINDEX_API_KEY?.trim());
}

export class PageIndexError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "PageIndexError";
    this.status = status;
    this.details = details;
  }
}

function apiKey(): string {
  const key = process.env.PAGEINDEX_API_KEY?.trim();
  if (!key) {
    throw new PageIndexError(
      "PAGEINDEX_API_KEY is not set. Add it to .env.local and restart the dev server.",
      401,
    );
  }
  return key;
}

/** Path segments may contain `/`, `?`, `#` or spaces — encode them. */
function enc(value: string): string {
  return encodeURIComponent(value);
}

async function readError(response: Response): Promise<PageIndexError> {
  const raw = await response.text().catch(() => "");
  let message = raw;
  let details: unknown;
  try {
    const parsed = JSON.parse(raw);
    details = parsed;
    message =
      (typeof parsed?.detail === "string" && parsed.detail) ||
      (typeof parsed?.message === "string" && parsed.message) ||
      (typeof parsed?.error === "string" && parsed.error) ||
      raw;
  } catch {
    // Upstream returned plain text.
  }
  if (!message) message = `PageIndex API responded ${response.status}`;
  if (response.status === 401 || response.status === 403) {
    message = `PageIndex rejected the request (${response.status}). Check PAGEINDEX_API_KEY. ${message}`.trim();
  }
  return new PageIndexError(message, response.status, details);
}

async function call(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 60_000, ...rest } = init;
  const signal = rest.signal ?? AbortSignal.timeout(timeoutMs);

  const response = await fetch(`${PAGEINDEX_API_URL}${path}`, {
    ...rest,
    signal,
    headers: {
      api_key: apiKey(),
      ...(rest.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) throw await readError(response);
  return response;
}

async function callJson<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const response = await call(path, init);
  return (await response.json()) as T;
}

export interface ListDocumentsParams {
  limit?: number;
  offset?: number;
  folderId?: string | null;
  name?: string;
  recursive?: boolean;
}

export async function listDocuments(
  params: ListDocumentsParams = {},
): Promise<DocumentListResponse> {
  const search = new URLSearchParams();
  search.set("limit", String(params.limit ?? 50));
  search.set("offset", String(params.offset ?? 0));
  if (params.folderId) search.set("folder_id", params.folderId);
  if (params.name) search.set("name", params.name);
  if (params.recursive) search.set("recursive", "true");
  return callJson<DocumentListResponse>(`/docs/?${search.toString()}`);
}

export async function getDocument(docId: string): Promise<PageIndexDocument> {
  return callJson<PageIndexDocument>(`/doc/${enc(docId)}/metadata/`);
}

export async function deleteDocument(docId: string): Promise<void> {
  await call(`/doc/${enc(docId)}/`, { method: "DELETE" });
}

export interface GetTreeOptions {
  summary?: boolean;
  includeText?: boolean;
}

export async function getTree(
  docId: string,
  options: GetTreeOptions = {},
): Promise<TreeResponse & { doc_name?: string }> {
  const search = new URLSearchParams({ type: "tree" });
  search.set("summary", String(options.summary ?? true));
  search.set("include_text", String(options.includeText ?? true));
  return callJson<TreeResponse & { doc_name?: string }>(
    `/doc/${enc(docId)}/?${search.toString()}`,
  );
}

/** OCR / page content. `include_images=true` swaps base64 for presigned URLs. */
export async function getPages(
  docId: string,
  options: { includeImages?: boolean } = {},
): Promise<OcrResponse> {
  const search = new URLSearchParams({ type: "ocr", format: "page" });
  search.set("include_images", String(options.includeImages ?? false));
  return callJson<OcrResponse>(`/doc/${enc(docId)}/?${search.toString()}`, {
    timeoutMs: 180_000,
  });
}

export async function getBlock(
  docId: string,
  blockId: string,
): Promise<BlockResponse> {
  return callJson<BlockResponse>(
    `/doc/${enc(docId)}/block/${enc(blockId)}/`,
  );
}

/** Presigned JPEG URL for a rendered page. */
export async function getPageImageUrl(
  docId: string,
  page: number,
): Promise<string | null> {
  const search = new URLSearchParams({
    start: String(page),
    end: String(page),
  });
  const body = await callJson<PageImageResponse>(
    `/doc/s3/${enc(docId)}/images?${search.toString()}`,
  );
  return body.images?.find((img) => img.page === page)?.url ?? null;
}

export async function listFolders(
  parentFolderId?: string,
): Promise<FolderListResponse> {
  const search = new URLSearchParams();
  if (parentFolderId) search.set("parent_folder_id", parentFolderId);
  const suffix = search.size ? `?${search.toString()}` : "";
  return callJson<FolderListResponse>(`/folders/${suffix}`);
}

export async function createFolder(input: {
  name: string;
  description?: string;
  parentFolderId?: string;
}): Promise<{ folder: PageIndexFolder }> {
  return callJson<{ folder: PageIndexFolder }>("/folder/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      ...(input.parentFolderId ? { parent_folder_id: input.parentFolderId } : {}),
    }),
  });
}

/**
 * Submit a PDF. The body is multipart/form-data and is forwarded as built by
 * the caller: `file` plus optional `folder_id`, `metadata`, `beta_headers`,
 * `if_*` toggles.
 */
export async function submitDocument(
  form: FormData,
): Promise<{ doc_id: string; name?: string }> {
  return callJson<{ doc_id: string; name?: string }>("/doc/", {
    method: "POST",
    body: form,
    timeoutMs: 300_000,
  });
}

/** Raw streaming chat completion: caller owns the SSE body. */
export async function openChatStream(
  payload: Record<string, unknown>,
): Promise<Response> {
  return call("/chat/completions/", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload),
    timeoutMs: 600_000,
  });
}

/** Presigned URL for a figure OCR extracted from the document. */
export async function getDocumentImageUrl(
  docId: string,
  imageId: string,
): Promise<string | null> {
  const body = await callJson<{ url?: string }>(
    `/doc/${enc(docId)}/image/${enc(imageId)}/`,
  );
  return body.url ?? null;
}

/**
 * Wire types for the PageIndex Cloud API.
 *
 * Sources (see docs/REVERSE-ENGINEERING.md):
 *  - https://api.pageindex.ai/openapi.json (OpenAPI 3.1, FastAPI)
 *  - the official SDKs' declared response types (@pageindex/sdk 0.8.0, pageindex-py)
 *  - https://docs.pageindex.ai/api-reference
 *
 * Fields marked optional are ones we could not observe in a live response,
 * because verifying them needs a Cloud API key.
 */

export type DocumentStatus = "queued" | "processing" | "completed" | "failed";

export interface PageIndexDocument {
  id: string;
  name: string;
  description: string | null;
  status: DocumentStatus | string;
  createdAt: string;
  pageNum?: number;
  folderId?: string | null;
  /** Folder chain + file name, rendered by the API on GET /docs listings only. */
  path?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DocumentListResponse {
  documents: PageIndexDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface PageIndexFolder {
  id: string;
  name: string;
  description: string | null;
  parent_folder_id: string | null;
  created_at: string;
  updated_at: string;
  file_count: number;
  children_count: number;
}

export interface FolderListResponse {
  folders: PageIndexFolder[];
  total: number;
}

export interface TreeNode {
  title: string;
  node_id: string;
  page_index: number;
  text?: string;
  summary?: string;
  nodes?: TreeNode[];
}

/** GET /doc/{doc_id}/?type=tree */
export interface TreeResponse {
  doc_id: string;
  status: DocumentStatus | string;
  retrieval_ready?: boolean;
  result?: TreeNode[];
}

/** One layout block inside a page, when blocks are available. */
export interface PageBlock {
  block_id: string;
  block_type?: string;
  bbox?: [number, number, number, number];
  text?: string;
}

/** One entry of GET /doc/{doc_id}/?type=ocr&format=page */
export interface PageContent {
  page_index: number;
  markdown: string;
  /** Base64 payloads, or presigned URLs when include_images=true. */
  images?: string[];
  /** Present when the document was indexed with the block_reference beta. */
  blocks?: PageBlock[];
}

/** GET /doc/{doc_id}/?type=ocr&format=page */
export interface OcrResponse {
  doc_id: string;
  status: DocumentStatus | string;
  retrieval_ready?: boolean;
  result?: PageContent[];
}

/**
 * GET /doc/{doc_id}/block/{block_id}/
 * bbox is [x0, y0, x1, y1] in thousandths (0-1000) of page width/height,
 * origin top-left.
 */
export interface BlockResponse {
  doc_id: string;
  page: number;
  block_id: string;
  bbox: [number, number, number, number];
  block_type: string;
  text?: string;
}

export interface PageImageResponse {
  images: Array<{ page: number; url: string }>;
}

/** A citation resolved from the chat answer text. */
export interface Citation {
  /** Document name as the answer cites it. */
  document: string;
  page: number;
  blockId?: string;
  /** Layout block kind, e.g. "text" or "list" (citations frame only). */
  blockType?: string;
  bbox?: [number, number, number, number];
  /** Resolved by the app when the name matches a document in scope. */
  docId?: string;
}

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Normalized events our /api/chat route streams to the browser. */
export type ChatStreamEvent =
  | { type: "context"; docs: Array<{ id: string; name: string }> }
  | { type: "block"; index: number }
  | { type: "text"; delta: string; block?: number }
  | {
      type: "tool";
      id?: string;
      name: string;
      status: "start" | "stop" | "error";
      args?: unknown;
      /** Present on the MCP lane, which returns real tool payloads. */
      result?: unknown;
    }
  | {
      type: "citations";
      citations: Array<
        Pick<Citation, "document" | "page" | "blockId" | "blockType" | "bbox">
      >;
    }
  | { type: "done"; finishReason?: string | null }
  | { type: "error"; message: string };

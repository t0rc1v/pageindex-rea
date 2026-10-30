import { openChatStream } from "@/lib/pageindex/client";
import { citationNameMap, displayDocumentName } from "@/lib/pageindex/doc-scope";
import { encodeEvent, translateStream } from "@/lib/pageindex/chat-stream";
import { hasLlmKey, openMcpChatStream } from "@/lib/pageindex/mcp-chat";
import type { ChatMessage, ChatStreamEvent } from "@/lib/pageindex/types";
import { documentsByIds, listTenantDocuments, ownedDocumentIds } from "@/lib/server/documents";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { RATE_LIMITS } from "@/lib/server/limits";
import { rateLimit, rateLimited } from "@/lib/server/rate-limit";
import { requireTenant } from "@/lib/server/tenant";

const MAX_MESSAGES = 24;
const MAX_CHARS = 120_000;
const MAX_DOCS = 8;

interface ChatRequestBody {
  messages?: unknown;
  docIds?: unknown;

  folderId?: unknown;
  context?: unknown;
}

/** A page the reader pinned into the question ("Add page to chat"). */
interface PageContextItem {
  docName?: string;
  page?: number;
  text?: string;
}

const MAX_CONTEXT_ITEMS = 4;
const MAX_CONTEXT_CHARS = 24_000;

function parseContext(value: unknown): PageContextItem[] {
  if (!Array.isArray(value)) return [];
  const items: PageContextItem[] = [];
  let chars = 0;
  for (const raw of value.slice(0, MAX_CONTEXT_ITEMS)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as { docName?: unknown; page?: unknown; text?: unknown };
    const text = typeof item.text === "string" ? item.text.trim() : "";
    if (!text) continue;
    if (chars + text.length > MAX_CONTEXT_CHARS) break;
    chars += text.length;
    items.push({
      docName: typeof item.docName === "string" ? item.docName : undefined,
      page: typeof item.page === "number" ? item.page : undefined,
      text,
    });
  }
  return items;
}

/**
 * Pinned pages travel as a system message: the chat endpoints accept a document
 * scope, not a page scope, so the reader states the pages it already opened.
 * The managed lane sends this as-is; the MCP lane lifts system messages into
 * `instructions`, because AI SDK 7 rejects them in `messages`.
 */
function contextMessage(items: PageContextItem[]): ChatMessage {
  const body = items
    .map((item) => {
      const where = [item.docName, item.page ? `page ${item.page}` : null]
        .filter(Boolean)
        .join(", ");
      return `<page ${where}>` + "\n" + item.text + "\n" + "</page>";
    })
    .join("\n" + "\n");
  return {
    role: "system",
    content:
      "The reader attached the following pages from their library to this question. " +
      "Treat them as already open and cite them normally." + "\n" + "\n" +
      body,
  };
}

function parseMessages(value: unknown): ChatMessage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const messages: ChatMessage[] = [];
  let chars = 0;

  for (const item of value.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if (role !== "system" && role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || !content.trim()) return null;
    chars += content.length;
    messages.push({ role, content });
  }

  if (chars > MAX_CHARS) return null;
  return messages;
}

function parseDocIds(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, MAX_DOCS);
}

/**
 * POST /api/chat — the reader's answer lane.
 *
 * Proxies `POST /chat/completions/` with `enable_citations: true`, translating
 * PageIndex's SSE into normalized events (see lib/pageindex/chat-stream.ts) so
 * the UI can separate prose, tool activity and citations.
 */
export async function POST(request: Request) {
  const { tenantId, userId } = await requireTenant();

  // Streaming completions are the most expensive thing this app does.
  const verdict = await rateLimit(`chat:${userId}`, RATE_LIMITS.chatPerMinute, 60);
  if (!verdict.allowed) return rateLimited(verdict);

  try {
    const body = (await request.json()) as ChatRequestBody;
    const history = parseMessages(body.messages);
    if (!history) {
      return jsonResponse(
        {
          error: "Send a non-empty `messages` array of {role, content}.",
          code: "INTERNAL",
          status: 400,
        },
        { status: 400 },
      );
    }

    const requested = parseDocIds(body.docIds);
    // The upstream will answer about any document id it is given, including
    // another tenant's. Scope the request to the registry before it goes out.
    const owned = await ownedDocumentIds(tenantId);
    const docIds = requested.filter((id) => owned.has(id));

    if (requested.length > 0 && docIds.length === 0) {
      return jsonResponse(
        {
          error: "None of the selected documents are available in this workspace.",
          code: "NOT_FOUND",
          status: 404,
        },
        { status: 404 },
      );
    }

    // Names come from the registry, never from the request: `name` is the
    // workspace's display name and `upstreamName` is what PageIndex answers to.
    const rows =
      docIds.length > 0
        ? await documentsByIds(tenantId, docIds)
        : (await listTenantDocuments(tenantId, { limit: 100 })).rows;

    const docs = rows.map((row) => ({
      id: row.pageindexId,
      name: row.name,
      upstreamName: row.upstreamName,
    }));

    // Pinned pages are passed as a system preamble, not as user text, so they
    // never appear inside the conversation itself.
    const pinned = parseContext(body.context);
    const messages = pinned.length > 0 ? [contextMessage(pinned), ...history] : history;

    // Two lanes, same client events:
    //  - MCP (preferred, docs-recommended): our model drives PageIndex's tools.
    //  - managed (legacy endpoint): PageIndex runs the agent; no model key needed.
    if (hasLlmKey()) {
      const controller = new AbortController();
      return streamResponse(
        openMcpChatStream({ messages, docs, signal: controller.signal }),
        docs,
        () => controller.abort(),
      );
    }

    const payload: Record<string, unknown> = {
      messages,
      stream: true,
      enable_citations: true,
      ...(docIds.length === 1 ? { doc_id: docIds[0] } : {}),
      ...(docIds.length > 1 ? { doc_id: docIds } : {}),
    };

    const upstream = await openChatStream(payload);
    if (!upstream.body) {
      return jsonResponse(
        { error: "PageIndex returned an empty chat stream.", code: "UPSTREAM", status: 502 },
        { status: 502 },
      );
    }

    const upstreamBody = upstream.body;
    // PageIndex cites the name it knows. Translate it before the browser sees it,
    // so a transcript never cites a name the library does not show.
    const toDisplay = citationNameMap(docs);
    return streamResponse(
      translateStream(upstreamBody),
      docs,
      () => {
        void upstreamBody.cancel().catch(() => {});
      },
      (name) => displayDocumentName(name, toDisplay),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Pipe normalized events to the browser as SSE. The context event always goes
 * first so citations can be resolved against document names.
 */
function streamResponse(
  events: AsyncIterable<ChatStreamEvent>,
  docs: Array<{ id: string; name: string }>,
  onCancel?: () => void,
  resolveName?: (name: string) => string,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatStreamEvent) => {
        try {
          controller.enqueue(encodeEvent(event));
        } catch {
          /* client gone */
        }
      };

      send({ type: "context", docs });

      try {
        for await (const event of events) {
          send(
            event.type === "citations" && resolveName
              ? {
                  ...event,
                  citations: event.citations.map((citation) => ({
                    ...citation,
                    document: resolveName(citation.document),
                  })),
                }
              : event,
          );
        }
      } catch (error) {
        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "The chat stream ended unexpectedly.",
        });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      onCancel?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

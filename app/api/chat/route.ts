import { getDocument, listDocuments, openChatStream } from "@/lib/pageindex/client";
import { encodeEvent, translateStream } from "@/lib/pageindex/chat-stream";
import { hasLlmKey, openMcpChatStream } from "@/lib/pageindex/mcp-chat";
import type { ChatMessage, ChatStreamEvent } from "@/lib/pageindex/types";
import { errorResponse, jsonResponse } from "@/lib/server/http";

const MAX_MESSAGES = 24;
const MAX_CHARS = 120_000;
const MAX_DOCS = 8;

interface ChatRequestBody {
  messages?: unknown;
  docIds?: unknown;
  docs?: unknown;
  folderId?: unknown;
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

function parseDocs(value: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(value)) return [];
  const docs: Array<{ id: string; name: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const name = (item as { name?: unknown }).name;
    if (typeof id === "string" && typeof name === "string") docs.push({ id, name });
  }
  return docs;
}

/**
 * POST /api/chat — the reader's answer lane.
 *
 * Proxies `POST /chat/completions/` with `enable_citations: true`, translating
 * PageIndex's SSE into normalized events (see lib/pageindex/chat-stream.ts) so
 * the UI can separate prose, tool activity and citations.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ChatRequestBody;
    const messages = parseMessages(body.messages);
    if (!messages) {
      return jsonResponse(
        {
          error: "Send a non-empty `messages` array of {role, content}.",
          code: "INTERNAL",
          status: 400,
        },
        { status: 400 },
      );
    }

    const docIds = parseDocIds(body.docIds);
    let docs = parseDocs(body.docs).filter((doc) => docIds.includes(doc.id));

    // With no explicit scope the model may cite anything in the library, so the
    // client needs a name -> id index to make those citations openable.
    if (docIds.length === 0) {
      try {
        const library = await listDocuments({ limit: 100 });
        docs = library.documents.map((doc) => ({ id: doc.id, name: doc.name }));
      } catch {
        docs = [];
      }
    }

    if (docs.length === 0 && docIds.length > 0) {
      docs = await Promise.all(
        docIds.map(async (id) => {
          try {
            const doc = await getDocument(id);
            return { id, name: doc.name };
          } catch {
            return { id, name: id };
          }
        }),
      );
    }

    const folderId = typeof body.folderId === "string" ? body.folderId : undefined;

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
      ...(folderId && docIds.length === 0 ? { folder_id: folderId } : {}),
    };

    const upstream = await openChatStream(payload);
    if (!upstream.body) {
      return jsonResponse(
        { error: "PageIndex returned an empty chat stream.", code: "UPSTREAM", status: 502 },
        { status: 502 },
      );
    }

    const upstreamBody = upstream.body;
    return streamResponse(translateStream(upstreamBody), docs, () => {
      void upstreamBody.cancel().catch(() => {});
    });
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
        for await (const event of events) send(event);
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

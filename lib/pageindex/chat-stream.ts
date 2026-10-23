import type { ChatStreamEvent, Citation } from "./types";

/**
 * Translator for the PageIndex managed chat stream.
 *
 * Verified against live `POST /chat/completions/` traffic (2026-10-22). The
 * wire is OpenAI-shaped SSE plus PageIndex's own block markers:
 *
 *   text_block_start → text × N → text_stop          (answer prose)
 *   mcp_tool_use_start{tool_name} → tool_use × N → tool_use_stop
 *                                                    (tool ARGUMENTS, not prose)
 *   choice.finish_reason = "end_turn"
 *   object = "chat.completion.citations"             (bboxes — AFTER finish_reason)
 *   data: [DONE]
 *
 * Three consequences the previous implementation got wrong:
 *
 *  1. `tool_use` chunks carry argument JSON. Rendering them as prose leaks
 *     `{"doc_name": …}` into the answer.
 *  2. The citations frame — the only carrier of `bbox`, `block_id` and
 *     `block_type` — arrives *after* `finish_reason`. Stopping at
 *     finish_reason silently drops every bbox.
 *  3. `tool_use` is a content tag, not a stop tag; treating it as one closes
 *     the tool block on the first argument chunk.
 */

interface UpstreamCitation {
  document?: string;
  doc?: string;
  page?: number | string;
  block_id?: string;
  block?: string;
  block_type?: string;
  bbox?: [number, number, number, number] | null;
}

interface UpstreamChunk {
  error?: unknown;
  object?: string;
  block_metadata?: {
    type?: string;
    tool_name?: string;
    server_name?: string;
    block_index?: number;
    [key: string]: unknown;
  };
  choices?: Array<{
    index?: number;
    delta?: { role?: string; content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: unknown;
  citations?: UpstreamCitation[];
}

const TOOL_START = new Set(["mcp_tool_use_start", "tool_use_start"]);
const TOOL_STOP = new Set(["mcp_tool_use_stop", "tool_use_stop"]);

function citationsFrom(chunk: UpstreamChunk): Citation[] {
  if (!Array.isArray(chunk.citations)) return [];
  const out: Citation[] = [];
  for (const entry of chunk.citations) {
    const document = String(entry.document ?? entry.doc ?? "").trim();
    const page = Number.parseInt(String(entry.page ?? ""), 10);
    if (!document || !Number.isFinite(page) || page <= 0) continue;
    const blockId = entry.block_id ?? entry.block ?? undefined;
    out.push({
      document,
      page,
      ...(blockId ? { blockId: String(blockId) } : {}),
      ...(entry.block_type ? { blockType: String(entry.block_type) } : {}),
      ...(Array.isArray(entry.bbox) && entry.bbox.length === 4
        ? { bbox: entry.bbox as [number, number, number, number] }
        : {}),
    });
  }
  return out;
}

/** Map PageIndex / SDK error codes onto copy a reader can act on. */
export function friendlyError(raw: string): string | null {
  const code = raw.trim();
  const upper = code.toUpperCase();
  if (/INSUFFICIENTCREDITS|USAGE_LIMIT_REACHED|NO_CREDITS|QUOTA/.test(upper)) {
    return "This PageIndex account has no chat credits left. Top up pages, or switch to the MCP lane with your own model key (Settings explains both).";
  }
  if (/PLAN_REQUIRED|SUBSCRIPTION_REQUIRED/.test(upper)) {
    return "The current PageIndex plan does not include this feature.";
  }
  if (/RATE_LIMIT/.test(upper)) {
    return "PageIndex is rate limiting this account. Try again in a moment.";
  }
  if (/UNAUTHORIZED|INVALID_API_KEY|401/.test(upper)) {
    return "PageIndex rejected the API key. Check PAGEINDEX_API_KEY in .env.local.";
  }
  if (/FOLDER_SCOPE_VIOLATION/.test(upper)) {
    return "That document is outside the folder scope of the API key.";
  }
  return null;
}

export class ChatTranslator {
  private toolName: string | null = null;
  private toolArgs = "";
  private finishReason: string | null = null;

  /** Feed one upstream chunk; returns the events it produced. */
  push(chunk: UpstreamChunk): ChatStreamEvent[] {
    const events: ChatStreamEvent[] = [];

    if (chunk.error) {
      // The Cloud API surfaces machine codes here; translate the ones a reader
      // can act on instead of printing `InsufficientCredits` into the answer.
      const friendly = friendlyError(
        typeof chunk.error === "string" ? chunk.error : JSON.stringify(chunk.error),
      );
      if (friendly) return [{ type: "error", message: friendly }];
      const message =
        typeof chunk.error === "string" ? chunk.error : JSON.stringify(chunk.error);
      return [{ type: "error", message }];
    }

    const meta = chunk.block_metadata ?? {};
    const kind = typeof meta.type === "string" ? meta.type : undefined;
    const choice = chunk.choices?.[0];
    const content =
      typeof choice?.delta?.content === "string" ? choice.delta.content : "";

    if (choice?.finish_reason) this.finishReason = choice.finish_reason;

    if (kind === "text_block_start") {
      // A new prose block: the last one is the answer, earlier ones are the
      // model narrating what it is about to look up.
      const index = Number(meta.block_index ?? 0);
      return [{ type: "block", index }];
    }

    if (kind && TOOL_START.has(kind)) {
      this.toolName = String(meta.tool_name ?? "tool");
      this.toolArgs = "";
      events.push({ type: "tool", name: this.toolName, status: "start" });
      if (content) this.toolArgs += content;
      return events;
    }

    if (kind && TOOL_STOP.has(kind)) {
      events.push(...this.closeTool());
      return events;
    }

    if (kind && kind.startsWith("mcp_tool_result")) {
      // The managed stream carries no tool result payload; the marker itself
      // has nothing to render.
      return events;
    }

    if (this.toolName !== null) {
      // Any content while a tool block is open is that tool's argument JSON —
      // tagged `tool_use`, or untagged on older servers.
      if (content) this.toolArgs += content;
      return events;
    }

    if (content) {
      const block =
        typeof meta.block_index === "number" ? meta.block_index : undefined;
      events.push({
        type: "text",
        delta: content,
        ...(block === undefined ? {} : { block }),
      });
    }

    const citations = citationsFrom(chunk);
    if (citations.length > 0) {
      events.push({
        type: "citations",
        citations: citations.map(({ document, page, blockId, blockType, bbox }) => ({
          document,
          page,
          ...(blockId ? { blockId } : {}),
          ...(blockType ? { blockType } : {}),
          ...(bbox ? { bbox } : {}),
        })),
      });
    }

    return events;
  }

  /** End of stream: close any open tool block and report the finish reason. */
  finish(): ChatStreamEvent[] {
    return [
      ...this.closeTool(),
      { type: "done", finishReason: this.finishReason },
    ];
  }

  private closeTool(): ChatStreamEvent[] {
    if (this.toolName === null) return [];
    const name = this.toolName;
    const raw = this.toolArgs.trim();
    this.toolName = null;
    this.toolArgs = "";
    if (!raw) return [{ type: "tool", name, status: "stop" }];
    let args: unknown = raw;
    try {
      args = JSON.parse(raw);
    } catch {
      /* keep the raw string */
    }
    return [{ type: "tool", name, status: "stop", args }];
  }
}

/** One-off translation, useful for tests. */
export function translateChunk(chunk: UpstreamChunk): ChatStreamEvent[] {
  return new ChatTranslator().push(chunk);
}

/** Rewrite the upstream SSE body into our normalized event stream. */
export async function* translateStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const translator = new ChatTranslator();
  let buffer = "";
  let sawDone = false;

  try {
    while (!sawDone) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline !== -1 && !sawDone) {
        const rawLine = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        const line = rawLine.replace(/\r$/, "");
        if (!line || line.startsWith(":") || line.startsWith("event:")) continue;
        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();
        if (!data) continue;
        if (data === "[DONE]") {
          sawDone = true;
          break;
        }

        let parsed: UpstreamChunk;
        try {
          parsed = JSON.parse(data) as UpstreamChunk;
        } catch {
          continue; // keepalive or partial frame
        }

        for (const event of translator.push(parsed)) yield event;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  // The citations frame arrives before [DONE] but after finish_reason; reading
  // to the end is what makes bbox data available at all.
  for (const event of translator.finish()) yield event;
}

export function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

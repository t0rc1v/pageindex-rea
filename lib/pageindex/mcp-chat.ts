import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { openai } from "@ai-sdk/openai";
import { dynamicTool, jsonSchema, stepCountIs, streamText, type ToolSet } from "ai";

import { PAGEINDEX_API_URL } from "./client";
import type { ChatMessage, ChatStreamEvent } from "./types";

/**
 * The MCP lane: our own model drives PageIndex's MCP tools.
 *
 * PageIndex documents `/chat/completions` as the legacy chat API and recommends
 * this shape instead (`https://docs.pageindex.ai/mcp`): connect to
 * `https://api.pageindex.ai/mcp` over HTTP with the PageIndex key as a Bearer
 * token, expose its tools to your model, and let the model read the tree.
 *
 * Differences from the managed lane, and how this module handles them:
 *  - No citations frame: the model writes `<cite doc="…" page="…" block="…"/>`
 *    itself, so the system prompt fixes the exact format (block ids come from
 *    page content, and the app resolves each citation's bbox from the block id).
 *  - Tool arguments never appear in the text: the tool loop is ours, so tools are
 *    real events rather than tagged deltas.
 *  - Destructive MCP tools (delete/remove) are withheld from the model.
 */

export const MCP_URL =
  process.env.PAGEINDEX_MCP_URL?.trim() || `${PAGEINDEX_API_URL}/mcp`;

export function hasLlmKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function llmModelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

const MAX_TOOL_CHARS = 60_000;
const MAX_STEPS = 12;

function systemPrompt(docs: Array<{ id: string; name: string }>): string {
  const scope =
    docs.length === 0
      ? "The whole PageIndex library is available."
      : `The user scoped this conversation to:\n${docs
          .map((doc) => `- ${doc.name}`)
          .join("\n")}\nStay within these documents.`;

  return [
    "You are the research assistant inside PageIndex Reader, a co-reader for long documents.",
    "PageIndex indexes each document as a hierarchical tree; tools expose that tree and the page text behind it.",
    "",
    "How to work:",
    "1. Orient with the document structure before quoting from it.",
    "2. Read only the pages you need; do not guess page content.",
    "3. Answer in concise markdown, leading with the answer, then the evidence.",
    "",
    "Citations (required whenever you state a fact from a document):",
    '- Format: <cite doc="EXACT document name" page="12" block="p12_text_3"/>',
    '- Put the tag immediately after the claim it supports.',
    '- Use the exact block_id the page content shows for that passage; if the output has no block id, cite the page only: <cite doc="…" page="12"/>.',
    "- One page per tag. Never invent a page number, block id or document name.",
    "",
    scope,
  ].join("\n");
}

interface McpTextContent {
  type?: string;
  text?: string;
}

function mcpResultText(result: unknown): string {
  const record = result as { content?: McpTextContent[]; isError?: boolean };
  const text = (record.content ?? [])
    .filter((item) => typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
  const clipped =
    text.length > MAX_TOOL_CHARS
      ? `${text.slice(0, MAX_TOOL_CHARS)}\n\n[output truncated by the client]`
      : text;
  if (record.isError) return `Tool error: ${clipped || "unknown error"}`;
  return clipped || "No content returned.";
}

function field(part: unknown, key: string): unknown {
  return (part as Record<string, unknown>)[key];
}

function stringField(part: unknown, key: string): string | undefined {
  const value = field(part, key);
  return typeof value === "string" ? value : undefined;
}

/** Open the MCP session, expose its read tools, and stream the agent's answer. */
export async function* openMcpChatStream(input: {
  messages: ChatMessage[];
  docs: Array<{ id: string; name: string }>;
  signal?: AbortSignal;
}): AsyncGenerator<ChatStreamEvent> {
  const apiKey = process.env.PAGEINDEX_API_KEY?.trim();
  if (!apiKey) {
    yield {
      type: "error",
      message: "PAGEINDEX_API_KEY is not set, so the PageIndex MCP tools cannot be reached.",
    };
    return;
  }

  const client = new Client(
    { name: "pageindex-reader", version: "1.0.0" },
    { capabilities: {} },
  );
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json, text/event-stream" },
    },
  });

  try {
    await client.connect(transport);

    const { tools } = await client.listTools();
    const toolSet: ToolSet = {};

    for (const tool of tools) {
      // Reading tools only: the model must not be able to delete a document.
      if (/remove|delete|drop|destructive/i.test(tool.name)) continue;
      toolSet[tool.name] = dynamicTool({
        description: tool.description ?? tool.name,
        inputSchema: jsonSchema(
          (tool.inputSchema ?? {
            type: "object",
            properties: {},
            additionalProperties: false,
          }) as Parameters<typeof jsonSchema>[0],
        ),
        execute: async (args) => {
          const result = await client.callTool({
            name: tool.name,
            arguments: (args ?? {}) as Record<string, unknown>,
          });
          return mcpResultText(result);
        },
      });
    }

    yield { type: "block", index: 0 };

    const result = streamText({
      model: openai(llmModelName()),
      system: systemPrompt(input.docs),
      messages: input.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      tools: toolSet,
      stopWhen: stepCountIs(MAX_STEPS),
      abortSignal: input.signal,
    });

    let step = 0;
    let finishReason: string | null = null;

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "start-step": {
          step += 1;
          yield { type: "block", index: step };
          break;
        }
        case "text-delta": {
          const text = stringField(part, "text") ?? "";
          if (text) yield { type: "text", delta: text, block: step };
          break;
        }
        case "tool-call": {
          yield {
            type: "tool",
            name: stringField(part, "toolName") ?? "tool",
            status: "start",
            args: field(part, "input"),
          };
          break;
        }
        case "tool-result": {
          yield {
            type: "tool",
            name: stringField(part, "toolName") ?? "tool",
            status: "stop",
            args: field(part, "input"),
            result: field(part, "output"),
          };
          break;
        }
        case "tool-error": {
          const message =
            field(part, "error") instanceof Error
              ? (field(part, "error") as Error).message
              : "Tool failed";
          yield {
            type: "tool",
            name: stringField(part, "toolName") ?? "tool",
            status: "error",
            args: field(part, "input"),
            result: { error: message },
          };
          break;
        }
        case "error": {
          const error = field(part, "error");
          yield {
            type: "error",
            message: error instanceof Error ? error.message : "The model stream failed.",
          };
          break;
        }
        case "finish": {
          const reason = stringField(part, "finishReason");
          if (reason) finishReason = reason;
          break;
        }
        default:
          break;
      }
    }

    yield { type: "done", finishReason };
  } catch (error) {
    yield {
      type: "error",
      message:
        error instanceof Error
          ? `MCP chat failed: ${error.message}`
          : "MCP chat failed.",
    };
  } finally {
    await client.close().catch(() => {});
  }
}

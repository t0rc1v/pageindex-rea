import { connection } from "next/server";

import { PAGEINDEX_API_URL, hasApiKey } from "@/lib/pageindex/client";
import { hasLlmKey, llmModelName, MCP_URL } from "@/lib/pageindex/mcp-chat";
import { errorResponse, jsonResponse } from "@/lib/server/http";

/**
 * Runtime configuration probe. The browser uses it to show a setup banner
 * instead of failing every request when the key is missing.
 *
 * `connection()` keeps this handler at request time: it reports deployment
 * env, which must never be baked into a prerendered response.
 */
export async function GET() {
  await connection();

  try {
    return jsonResponse({
      configured: hasApiKey(),
      apiUrl: PAGEINDEX_API_URL,
      lane: hasLlmKey() ? "mcp" : "managed",
      model: hasLlmKey() ? llmModelName() : null,
      mcpUrl: MCP_URL,
      betaHeaders: (process.env.PAGEINDEX_BETA_HEADERS ?? "block_reference")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

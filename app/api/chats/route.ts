import { deleteAllChats, listChats } from "@/lib/server/chats";
import { CHAT_LIST_SCOPE_PARAM, parseChatListScope } from "@/lib/chat-scope";
import { jsonResponse, searchParams } from "@/lib/server/http";
import { RATE_LIMITS } from "@/lib/server/limits";
import { rateLimit, rateLimited } from "@/lib/server/rate-limit";
import { requireTenant } from "@/lib/server/tenant";

/**
 * GET /api/chats — Recents, or one document's Chat menu with `?docId=`.
 *
 * The two are disjoint: Recents never contains a chat born in a document.
 */
export async function GET(request: Request) {
  const { tenantId, userId } = await requireTenant();

  const scope = parseChatListScope(searchParams(request).get(CHAT_LIST_SCOPE_PARAM));
  if (!scope) {
    // A malformed id cannot match a row, and Postgres would raise a cast error
    // instead of returning an empty list.
    return jsonResponse(
      { error: "That document id is not valid.", code: "INTERNAL", status: 400 },
      { status: 400 },
    );
  }

  return jsonResponse({
    chats: await listChats(
      tenantId,
      userId,
      scope.kind === "document" ? { docId: scope.docId } : {},
    ),
  });
}

/** DELETE /api/chats — clear the caller's conversations (settings action). */
export async function DELETE() {
  const { tenantId, userId } = await requireTenant();

  // Destructive and irreversible, so it is budgeted far more tightly than a
  // normal write.
  const verdict = await rateLimit(`chats-clear:${userId}`, RATE_LIMITS.chatClearsPerHour, 3600);
  if (!verdict.allowed) return rateLimited(verdict);

  return jsonResponse({ deleted: await deleteAllChats(tenantId, userId) });
}

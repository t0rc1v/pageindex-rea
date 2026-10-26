import { deleteAllChats, listChats } from "@/lib/server/chats";
import { jsonResponse } from "@/lib/server/http";
import { RATE_LIMITS } from "@/lib/server/limits";
import { rateLimit, rateLimited } from "@/lib/server/rate-limit";
import { requireTenant } from "@/lib/server/tenant";

/** GET /api/chats — the caller's Recents, newest first. */
export async function GET() {
  const { tenantId, userId } = await requireTenant();
  return jsonResponse({ chats: await listChats(tenantId, userId) });
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

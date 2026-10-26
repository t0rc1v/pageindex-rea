import { deleteAllChats, listChats } from "@/lib/server/chats";
import { jsonResponse } from "@/lib/server/http";
import { requireTenant } from "@/lib/server/tenant";

/** GET /api/chats — the caller's Recents, newest first. */
export async function GET() {
  const { tenantId, userId } = await requireTenant();
  return jsonResponse({ chats: await listChats(tenantId, userId) });
}

/** DELETE /api/chats — clear the caller's conversations (settings action). */
export async function DELETE() {
  const { tenantId, userId } = await requireTenant();
  return jsonResponse({ deleted: await deleteAllChats(tenantId, userId) });
}

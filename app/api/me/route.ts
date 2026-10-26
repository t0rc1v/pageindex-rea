import { auth } from "@clerk/nextjs/server";

import { jsonResponse } from "@/lib/server/http";

/**
 * GET /api/me — who the caller is, straight from the session.
 *
 * `orgId`/`orgRole` are the tenancy hooks: once the Neon layer lands, every
 * domain row is scoped by `orgId ?? userId`, and this is the only place the
 * browser needs to learn which space it is writing into.
 */
export async function GET() {
  const { userId, orgId, orgRole, orgSlug, sessionId } = await auth.protect();

  return jsonResponse({ userId, orgId, orgRole, orgSlug, sessionId });
}

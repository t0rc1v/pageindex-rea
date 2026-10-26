import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { tenants, users } from "@/lib/db/schema";
import {
  ensureOrganizationTenant,
  ensurePersonalTenant,
  findOrgTenant,
} from "@/lib/server/tenant";

/**
 * Clerk → Postgres mirror.
 *
 * The session already carries `userId` and `orgId`, so reads never need this
 * table. It exists so rows can be joined to a name, an avatar and an email
 * without a Backend API call per render — and so a deleted account takes its
 * personal space, documents metadata and transcripts with it instead of leaving
 * unreachable rows behind.
 *
 * The webhook is the only writer of profile fields; the lazy upsert in
 * `ensurePersonalTenant` creates the row (id + tenant) with nulls, which is
 * enough for every query here to work.
 */
export interface ClerkUserPayload {
  id: string;
  primary_email_address_id?: string | null;
  email_addresses?: Array<{ id?: string; email_address?: string }>;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

export interface ClerkOrganizationPayload {
  id: string;
  name?: string | null;
  slug?: string | null;
}

export async function upsertUser(payload: ClerkUserPayload): Promise<void> {
  await ensurePersonalTenant(payload.id);
  const email =
    payload.email_addresses?.find((address) => address.id === payload.primary_email_address_id)
      ?.email_address ?? payload.email_addresses?.[0]?.email_address ?? null;

  await getDb()
    .update(users)
    .set({
      email,
      firstName: payload.first_name ?? null,
      lastName: payload.last_name ?? null,
      imageUrl: payload.image_url ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, payload.id));

  // `ensurePersonalTenant` inserted the row if it was missing, so the update
  // above always lands on a real user with its tenant link intact.
}

/**
 * Deleting the personal tenant removes the user row and every chat through the
 * cascades on `users.tenant_id` and `chats.created_by`.
 */
export async function deleteUser(userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return;
  await db.delete(tenants).where(eq(tenants.id, row.tenantId));
}

export async function upsertOrganization(payload: ClerkOrganizationPayload): Promise<void> {
  const tenantId = await ensureOrganizationTenant(payload.id, payload.name ?? undefined);
  const name = payload.name?.trim() || payload.slug?.trim();
  if (!name) return;

  await getDb()
    .update(tenants)
    .set({ name })
    .where(eq(tenants.id, tenantId));
}

/** Removing a team tenant cascades its documents and conversations. */
export async function deleteOrganization(organizationId: string): Promise<void> {
  const tenantId = await findOrgTenant(organizationId);
  if (!tenantId) return;
  await getDb().delete(tenants).where(eq(tenants.id, tenantId));
}

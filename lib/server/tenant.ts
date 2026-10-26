import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { tenants, users } from "@/lib/db/schema";

export interface TenantContext {
  userId: string;
  /** Never null: personal spaces are tenants too. */
  tenantId: string;
  orgId: string | null;
  orgRole: string | null;
}

/**
 * The one place a request turns into a tenant.
 *
 * `tenantId = orgId` when the session is acting inside a Clerk Organization,
 * otherwise the caller's personal tenant. Callers only ever filter by the
 * returned `tenantId`, so personal and team scopes share a single query shape.
 */
export async function requireTenant(): Promise<TenantContext> {
  const { userId, orgId, orgRole } = await auth.protect();

  return {
    userId,
    tenantId: await resolveTenantId(userId, orgId),
    orgId: orgId ?? null,
    orgRole: orgRole ?? null,
  };
}

/**
 * Resolve — or lazily create — the tenant a session writes into.
 *
 * Lazy creation exists so a user can read a document before any webhook has
 * been delivered, and so a freshly created Organization works on its first
 * request. Both paths are race-safe: the loser of a concurrent insert reads the
 * winner's row instead of duplicating one.
 */
async function resolveTenantId(userId: string, orgId: string | null | undefined): Promise<string> {
  const db = getDb();

  if (orgId) {
    const existing = await findOrgTenant(orgId);
    if (existing) return existing;

    const inserted = await db
      .insert(tenants)
      .values({ clerkOrgId: orgId, name: await organizationName(orgId) })
      .onConflictDoNothing()
      .returning({ id: tenants.id });

    const raced = inserted[0]?.id ?? (await findOrgTenant(orgId));
    if (!raced) throw new Error(`Could not resolve a tenant for organization ${orgId}.`);
    return raced;
  }

  const existing = await findPersonalTenant(userId);
  if (existing) return existing;

  // `neon-http` has no interactive transaction, but a batch is one.
  const tenantId = crypto.randomUUID();
  const [, insertedUser] = await db.batch([
    db.insert(tenants).values({ id: tenantId, name: "Personal space" }),
    db
      .insert(users)
      .values({ id: userId, tenantId })
      .onConflictDoNothing()
      .returning({ tenantId: users.tenantId }),
  ]);

  const winner = insertedUser[0]?.tenantId;
  if (winner) return winner;

  // Another request created the user first; drop the tenant we did not need.
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  const raced = await findPersonalTenant(userId);
  if (!raced) throw new Error(`Could not resolve a tenant for user ${userId}.`);
  return raced;
}

async function findOrgTenant(orgId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.clerkOrgId, orgId))
    .limit(1);
  return row?.id ?? null;
}

async function findPersonalTenant(userId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ tenantId: users.tenantId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.tenantId ?? null;
}

async function organizationName(orgId: string): Promise<string> {
  try {
    const client = await clerkClient();
    const organization = await client.organizations.getOrganization({ organizationId: orgId });
    return organization.name || organization.slug || orgId;
  } catch {
    // A display name is not worth failing a request over.
    return orgId;
  }
}

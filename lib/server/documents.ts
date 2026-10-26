import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { listDocuments } from "@/lib/pageindex/client";
import { jsonResponse } from "@/lib/server/http";
import { documents } from "@/lib/db/schema";

/**
 * The ownership registry.
 *
 * The PageIndex key is account-wide: the upstream API will serve any document id
 * it is given, so "this id exists" is never the same question as "this document
 * is yours". Every document route resolves the id through this module first, and
 * the only way a row appears here is an upload by a session in that tenant (or
 * the explicit claim script for documents that predate the registry).
 */

export interface OwnedDocument {
  pageindexId: string;
  name: string;
  pageCount: number | null;
}

export async function registerDocument(
  tenantId: string,
  userId: string,
  doc: { pageindexId: string; name: string; pageCount?: number | null },
): Promise<void> {
  await getDb()
    .insert(documents)
    .values({
      tenantId,
      uploadedBy: userId,
      pageindexId: doc.pageindexId,
      name: doc.name,
      pageCount: doc.pageCount ?? null,
    })
    .onConflictDoUpdate({
      target: [documents.tenantId, documents.pageindexId],
      set: { name: doc.name, updatedAt: new Date() },
    });
}

/**
 * Register whatever an upload created. A `.zip` bundle is expanded upstream and
 * answers with one entry per member file, each of which needs its own row or it
 * would be invisible to its uploader.
 */
export async function registerUploadResult(
  tenantId: string,
  userId: string,
  result: {
    doc_id?: string;
    name?: string;
    entries?: Array<{ doc_id?: string; name?: string }>;
  },
): Promise<void> {
  const targets: Array<{ pageindexId: string; name: string }> = [];
  if (result.doc_id) {
    targets.push({ pageindexId: result.doc_id, name: result.name ?? result.doc_id });
  }
  for (const entry of result.entries ?? []) {
    if (entry.doc_id) {
      targets.push({ pageindexId: entry.doc_id, name: entry.name ?? entry.doc_id });
    }
  }
  if (targets.length === 0) return;

  await getDb()
    .insert(documents)
    .values(
      targets.map((target) => ({
        tenantId,
        uploadedBy: userId,
        pageindexId: target.pageindexId,
        name: target.name,
      })),
    )
    .onConflictDoUpdate({
      target: [documents.tenantId, documents.pageindexId],
      // Multi-row upsert: each conflicting row updates from its own EXCLUDED.
      set: { name: sql`excluded.name`, updatedAt: new Date() },
    });
}

/**
 * Upstream listing reduced to what this tenant owns.
 *
 * The Cloud API has no "give me these ids" filter, so the scan is bounded and
 * the result is filtered here. Callers that need real pagination over a large
 * account should page the registry instead; this is the bridge that keeps
 * upstream status/description/folder fields available today.
 */
export async function listOwnedDocuments(
  tenantId: string,
  options: {
    limit?: number;
    folderId?: string | null;
    name?: string;
    recursive?: boolean;
  } = {},
) {
  const [owned, result] = await Promise.all([
    ownedDocumentIds(tenantId),
    listDocuments({
      limit: options.limit ?? 500,
      offset: 0,
      folderId: options.folderId ?? null,
      name: options.name,
      recursive: options.recursive,
    }),
  ]);

  return result.documents.filter((document) => owned.has(document.id));
}

/** The ids this tenant owns — used to filter an upstream listing down to them. */
export async function ownedDocumentIds(tenantId: string): Promise<Set<string>> {
  const rows = await getDb()
    .select({ id: documents.pageindexId })
    .from(documents)
    .where(eq(documents.tenantId, tenantId));

  return new Set(rows.map((row) => row.id));
}

/**
 * Resolve an upstream id to a row this tenant owns.
 *
 * A miss is deliberately indistinguishable from "does not exist": answering 403
 * would confirm that someone else's document lives at that id.
 */
export async function findDocument(
  tenantId: string,
  pageindexId: string,
): Promise<OwnedDocument | null> {
  const [row] = await getDb()
    .select({ pageindexId: documents.pageindexId, name: documents.name, pageCount: documents.pageCount })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.pageindexId, pageindexId)))
    .limit(1);

  return row ?? null;
}

export async function renameDocument(
  tenantId: string,
  pageindexId: string,
  name: string,
): Promise<void> {
  await getDb()
    .update(documents)
    .set({ name, updatedAt: new Date() })
    .where(and(eq(documents.tenantId, tenantId), eq(documents.pageindexId, pageindexId)));
}

export async function setDocumentPageCount(
  tenantId: string,
  pageindexId: string,
  pageCount: number,
): Promise<void> {
  await getDb()
    .update(documents)
    .set({ pageCount, updatedAt: new Date() })
    .where(and(eq(documents.tenantId, tenantId), eq(documents.pageindexId, pageindexId)));
}

export async function forgetDocument(tenantId: string, pageindexId: string): Promise<void> {
  await getDb()
    .delete(documents)
    .where(and(eq(documents.tenantId, tenantId), eq(documents.pageindexId, pageindexId)));
}

/** A registry miss and a nonexistent document look identical on purpose. */
export function documentNotFound(): Response {
  return jsonResponse(
    { error: "Document not found.", code: "NOT_FOUND", status: 404 },
    { status: 404 },
  );
}

/**
 * How many *other* tenants still reference this upstream document.
 *
 * The PageIndex account is shared, so deleting upstream destroys the file for
 * everyone who registered it. A tenant deleting its own row must not take the
 * document away from a workspace that still lists it.
 */
export async function countOtherOwners(pageindexId: string, tenantId: string): Promise<number> {
  const rows = await getDb()
    .select({ tenantId: documents.tenantId })
    .from(documents)
    .where(eq(documents.pageindexId, pageindexId));

  return rows.filter((row) => row.tenantId !== tenantId).length;
}

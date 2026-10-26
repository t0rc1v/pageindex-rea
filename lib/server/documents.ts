import "server-only";

import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { getDocument } from "@/lib/pageindex/client";
import { documents } from "@/lib/db/schema";
import { jsonResponse } from "@/lib/server/http";

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
  /** Display name chosen by this workspace. */
  name: string;
  /** What PageIndex calls it; MCP tools and citations use this. */
  upstreamName: string;
  pageCount: number | null;
}

export async function registerDocument(
  tenantId: string,
  userId: string,
  doc: {
    pageindexId: string;
    /** Defaults to the upstream name the first time a document is registered. */
    name?: string;
    upstreamName: string;
    pageCount?: number | null;
    folderId?: string | null;
    status?: string;
  },
): Promise<void> {
  await getDb()
    .insert(documents)
    .values({
      tenantId,
      uploadedBy: userId,
      pageindexId: doc.pageindexId,
      name: doc.name ?? doc.upstreamName,
      upstreamName: doc.upstreamName,
      pageCount: doc.pageCount ?? null,
      folderId: doc.folderId ?? null,
      status: doc.status ?? "completed",
    })
    .onConflictDoUpdate({
      target: [documents.tenantId, documents.pageindexId],
      // The upstream name is authoritative and refreshed; the display name is
      // the user's and must survive a re-registration.
      set: { upstreamName: doc.upstreamName, updatedAt: new Date() },
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
  folderId: string | null = null,
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
        upstreamName: target.name,
        folderId,
        // Indexing is asynchronous upstream; the first listing reconciles it.
        status: "processing",
      })),
    )
    .onConflictDoUpdate({
      target: [documents.tenantId, documents.pageindexId],
      // Multi-row upsert: each conflicting row updates from its own EXCLUDED.
      set: {
        // A re-registration (claim run again, or the same upstream id) refreshes
        // what upstream owns. `name` is the workspace's and stays as it is.
        upstreamName: sql`excluded.upstream_name`,
        folderId: sql`excluded.folder_id`,
        updatedAt: new Date(),
      },
    });
}

export interface RegistryDocument {
  pageindexId: string;
  name: string;
  upstreamName: string;
  folderId: string | null;
  pageCount: number | null;
  description: string | null;
  status: string;
  syncedAt: Date;
  createdAt: Date;
}

/**
 * List one page of this tenant's documents from the registry.
 *
 * The library used to be built by fetching the upstream list and filtering it,
 * which cannot paginate honestly (the filter runs after the page) and silently
 * hides everything past the scan limit. The registry is the authoritative set,
 * so ordering, paging and counting all happen in Postgres.
 */
export async function listTenantDocuments(
  tenantId: string,
  options: {
    /** A folder id, `"root"` for unfiled, or null for everything. */
    folderId?: string | null;
    name?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ rows: RegistryDocument[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const filters = [eq(documents.tenantId, tenantId)];
  if (options.folderId === "root") filters.push(isNull(documents.folderId));
  else if (options.folderId) filters.push(eq(documents.folderId, options.folderId));
  if (options.name) filters.push(eq(documents.name, options.name));

  const where = and(...filters);
  const db = getDb();

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        pageindexId: documents.pageindexId,
        name: documents.name,
        upstreamName: documents.upstreamName,
        folderId: documents.folderId,
        pageCount: documents.pageCount,
        description: documents.description,
        status: documents.status,
        syncedAt: documents.syncedAt,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(where)
      .orderBy(desc(documents.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(documents).where(where),
  ]);

  return { rows, total: Number(totalRow?.value ?? 0) };
}

/** How many rows one listing is allowed to reconcile with upstream. */
const MAX_REFRESH_PER_LIST = 5;
/** Recently changed rows are polled quickly; settled ones rarely. */
const PENDING_FRESH_MS = 5_000;
const SETTLED_FRESH_MS = 5 * 60_000;

/**
 * Reconcile the visible rows with upstream status.
 *
 * The registry owns identity and organisation, but indexing progress lives
 * upstream. Refreshing only the rows that are stale *and* on screen keeps this
 * O(visible), not O(library) — and rows are mutated in place so the caller
 * returns what it just learned without a second read.
 */
export async function refreshDocuments(
  tenantId: string,
  rows: RegistryDocument[],
): Promise<void> {
  const now = Date.now();
  const due = rows
    .filter((row) => {
      const age = now - row.syncedAt.getTime();
      return age > (row.status === "completed" ? SETTLED_FRESH_MS : PENDING_FRESH_MS);
    })
    .slice(0, MAX_REFRESH_PER_LIST);

  if (due.length === 0) return;

  await Promise.allSettled(
    due.map(async (row) => {
      try {
        const upstream = await getDocument(row.pageindexId);

        row.status = String(upstream.status ?? row.status);
        if (typeof upstream.pageNum === "number") row.pageCount = upstream.pageNum;
        if (typeof upstream.name === "string" && upstream.name) {
          // Someone may have renamed it in the PageIndex dashboard; the mirror
          // follows, while the workspace's own `name` is left alone.
          row.upstreamName = upstream.name;
        }
        if (row.description === null && typeof upstream.description === "string") {
          // Seed the description from upstream, but never overwrite one the user
          // wrote — this column is displayed, not synced.
          row.description = upstream.description;
        }
        row.syncedAt = new Date();

        await getDb()
          .update(documents)
          .set({
            status: row.status,
            pageCount: row.pageCount,
            description: row.description,
            upstreamName: row.upstreamName,
            syncedAt: row.syncedAt,
          })
          .where(
            and(eq(documents.tenantId, tenantId), eq(documents.pageindexId, row.pageindexId)),
          );
      } catch {
        // A flapping or deleted upstream document keeps its last known state, but
        // the timestamp moves so every listing does not retry it.
        row.syncedAt = new Date();
        await getDb()
          .update(documents)
          .set({ syncedAt: row.syncedAt })
          .where(
            and(eq(documents.tenantId, tenantId), eq(documents.pageindexId, row.pageindexId)),
          )
          .catch(() => {});
      }
    }),
  );
}

/** The shape `DocumentListResponse` already promises the browser. */
export function toDocumentResponse(row: RegistryDocument, folderPaths: Map<string, string>) {
  return {
    id: row.pageindexId,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    pageNum: row.pageCount ?? undefined,
    folderId: row.folderId,
    path: row.folderId ? folderPaths.get(row.folderId) ?? null : null,
    metadata: null,
  };
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
    .select({
      pageindexId: documents.pageindexId,
      name: documents.name,
      upstreamName: documents.upstreamName,
      pageCount: documents.pageCount,
    })
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

/** Display description, stored locally so an upstream refresh cannot clobber it. */
export async function setDocumentDescription(
  tenantId: string,
  pageindexId: string,
  description: string | null,
): Promise<void> {
  await getDb()
    .update(documents)
    .set({ description, updatedAt: new Date() })
    .where(and(eq(documents.tenantId, tenantId), eq(documents.pageindexId, pageindexId)));
}

/**
 * Registry rows for a set of upstream ids, in the order they were asked for.
 *
 * The chat lane builds its document list here rather than trusting names from
 * the browser: ids come from the client, names and the upstream mirror do not.
 */
export async function documentsByIds(
  tenantId: string,
  ids: string[],
): Promise<RegistryDocument[]> {
  if (ids.length === 0) return [];

  const rows = await getDb()
    .select({
      pageindexId: documents.pageindexId,
      name: documents.name,
      upstreamName: documents.upstreamName,
      folderId: documents.folderId,
      pageCount: documents.pageCount,
      description: documents.description,
      status: documents.status,
      syncedAt: documents.syncedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(and(eq(documents.tenantId, tenantId), inArray(documents.pageindexId, ids)));

  const byId = new Map(rows.map((row) => [row.pageindexId, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is RegistryDocument => Boolean(row));
}

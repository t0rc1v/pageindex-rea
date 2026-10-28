import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { documents, folders } from "@/lib/db/schema";

/**
 * Workspace folders.
 *
 * These live in Postgres, not in the PageIndex account. The upstream `/folders`
 * API is account-global, so a folder created by one tenant would be visible to
 * every other tenant; folder organisation is therefore local metadata and
 * uploads no longer send a `folder_id` upstream.
 */
export interface FolderRecord {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  fileCount: number;
  childrenCount: number;
}

export async function listFolders(tenantId: string): Promise<FolderRecord[]> {
  return getDb()
    .select({
      id: folders.id,
      name: folders.name,
      description: folders.description,
      parentId: folders.parentId,
      createdAt: folders.createdAt,
      updatedAt: folders.updatedAt,
      fileCount: sql<number>`(select count(*)::int from ${documents} where ${documents.folderId} = ${folders.id})`,
      childrenCount: sql<number>`(select count(*)::int from "folders" as child where child."parent_id" = ${folders.id})`,
    })
    .from(folders)
    .where(eq(folders.tenantId, tenantId))
    .orderBy(asc(folders.name));
}

export async function folderBelongsToTenant(tenantId: string, folderId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: folders.id })
    .from(folders)
    .where(sql`${folders.tenantId} = ${tenantId} and ${folders.id} = ${folderId}`)
    .limit(1);

  return Boolean(row);
}

/**
 * Create a folder. A `parentFolderId` from another tenant is refused — the
 * caller decides the status code, this only reports that it did not happen.
 */
export async function createFolder(
  tenantId: string,
  input: { name: string; description?: string | null; parentFolderId?: string | null },
): Promise<FolderRecord | null> {
  if (input.parentFolderId && !(await folderBelongsToTenant(tenantId, input.parentFolderId))) {
    return null;
  }

  const [row] = await getDb()
    .insert(folders)
    .values({
      tenantId,
      name: input.name,
      description: input.description ?? null,
      parentId: input.parentFolderId ?? null,
    })
    .returning();

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    parentId: row.parentId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    fileCount: 0,
    childrenCount: 0,
  };
}

/**
 * `folderId → "Legal / Contracts"` for the document cards. One query for every
 * folder in the tenant; the tree is shallow enough that walking it per row is
 * cheaper than a recursive CTE round trip.
 */
export async function folderPathMap(tenantId: string): Promise<Map<string, string>> {
  const rows = await getDb()
    .select({ id: folders.id, name: folders.name, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.tenantId, tenantId));

  const byId = new Map(rows.map((row) => [row.id, row]));
  const paths = new Map<string, string>();

  for (const row of rows) {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cursor: (typeof rows)[number] | undefined = row;

    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      parts.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }

    paths.set(row.id, parts.join(" / "));
  }

  return paths;
}

/** Shape the API layer and the library UI already speak. */
export function toFolderResponse(folder: FolderRecord) {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    parent_folder_id: folder.parentId,
    created_at: folder.createdAt.toISOString(),
    updated_at: folder.updatedAt.toISOString(),
    file_count: folder.fileCount,
    children_count: folder.childrenCount,
  };
}

/**
 * Delete a folder. Children cascade; documents inside are unfiled rather than
 * deleted — losing a folder must never lose a document.
 */
export async function deleteFolder(tenantId: string, folderId: string): Promise<boolean> {
  const rows = await getDb()
    .delete(folders)
    .where(and(eq(folders.tenantId, tenantId), eq(folders.id, folderId)))
    .returning({ id: folders.id });

  return rows.length > 0;
}

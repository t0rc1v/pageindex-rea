import { listTenantDocuments, refreshDocuments, toDocumentResponse } from "@/lib/server/documents";
import { folderPathMap } from "@/lib/server/folders";
import { errorResponse, intParam, jsonResponse, searchParams } from "@/lib/server/http";
import { requireTenant } from "@/lib/server/tenant";

/**
 * GET /api/docs — this tenant's documents, straight from the ownership registry.
 *
 * Ordering, paging and counting happen in Postgres, so the list is honest at any
 * library size. Status is the one thing the registry does not own: indexing runs
 * upstream, so the rows on screen are reconciled (bounded) before the response
 * and the outcome is written back.
 *
 * Query: `folderId` (an id, `root` for unfiled, or `all`), `name` (exact),
 * `limit` (1–200), `offset`.
 */
export async function GET(request: Request) {
  const { tenantId } = await requireTenant();

  try {
    const params = searchParams(request);
    const folderParam = params.get("folderId");
    const folderId = !folderParam || folderParam === "all" ? null : folderParam;

    const { rows, total } = await listTenantDocuments(tenantId, {
      folderId,
      name: params.get("name") ?? undefined,
      limit: intParam(params.get("limit"), 50, 1, 200),
      offset: intParam(params.get("offset"), 0, 0, 1_000_000),
    });

    await refreshDocuments(tenantId, rows);
    const paths = await folderPathMap(tenantId);

    return jsonResponse({
      documents: rows.map((row) => toDocumentResponse(row, paths)),
      total,
      limit: intParam(params.get("limit"), 50, 1, 200),
      offset: intParam(params.get("offset"), 0, 0, 1_000_000),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

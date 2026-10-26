import { listOwnedDocuments } from "@/lib/server/documents";
import { errorResponse, intParam, jsonResponse, searchParams } from "@/lib/server/http";
import { requireTenant } from "@/lib/server/tenant";

/**
 * Upper bound on how far upstream we scan before filtering by ownership. The
 * Cloud API cannot filter by a set of ids, so the listing is fetched and then
 * reduced to this tenant's registry rows.
 */
const SCAN_LIMIT = 500;

/**
 * GET /api/docs — documents this tenant owns, with the upstream fields
 * (status, description, folder path) the library renders.
 */
export async function GET(request: Request) {
  const { tenantId } = await requireTenant();

  try {
    const params = searchParams(request);
    const folderId = params.get("folderId");

    const visible = await listOwnedDocuments(tenantId, {
      limit: SCAN_LIMIT,
      folderId: folderId === "all" ? null : folderId,
      name: params.get("name") ?? undefined,
      recursive: params.get("recursive") === "true",
    });

    const limit = intParam(params.get("limit"), 50, 1, SCAN_LIMIT);
    const offset = intParam(params.get("offset"), 0, 0, 1_000_000);

    return jsonResponse({
      documents: visible.slice(offset, offset + limit),
      total: visible.length,
      limit,
      offset,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

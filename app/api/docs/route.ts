import { listDocuments } from "@/lib/pageindex/client";
import { errorResponse, intParam, jsonResponse, searchParams } from "@/lib/server/http";

/** GET /api/docs — paginated document list, optional folder / exact-name filter. */
export async function GET(request: Request) {
  try {
    const params = searchParams(request);
    const folderId = params.get("folderId");
    const result = await listDocuments({
      limit: intParam(params.get("limit"), 50, 1, 10000),
      offset: intParam(params.get("offset"), 0, 0, 1_000_000),
      folderId: folderId === "all" ? null : folderId,
      name: params.get("name") ?? undefined,
      recursive: params.get("recursive") === "true",
    });
    return jsonResponse(result);
  } catch (error) {
    return errorResponse(error);
  }
}

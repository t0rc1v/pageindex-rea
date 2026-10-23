import { getPageImageUrl } from "@/lib/pageindex/client";
import { errorResponse, intParam, jsonResponse, searchParams } from "@/lib/server/http";

/**
 * GET /api/docs/:docId/image?page=3
 *
 * Resolves the presigned JPEG for a rendered page. The URL is short-lived and
 * is handed to the browser rather than proxied, so page renders cost this app
 * nothing beyond the redirect lookup.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/docs/[docId]/image">,
) {
  try {
    const { docId } = await ctx.params;
    const page = intParam(searchParams(request).get("page"), 1, 1, 100_000);
    const url = await getPageImageUrl(docId, page);
    if (!url) {
      return jsonResponse(
        { error: `No page image available for page ${page}.`, code: "NOT_FOUND", status: 404 },
        { status: 404 },
      );
    }
    return jsonResponse({ url, page });
  } catch (error) {
    return errorResponse(error);
  }
}

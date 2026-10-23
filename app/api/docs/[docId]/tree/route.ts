import { getTree } from "@/lib/pageindex/client";
import { errorResponse, jsonResponse, searchParams } from "@/lib/server/http";

/**
 * GET /api/docs/:docId/tree
 * The PageIndex tree — the hierarchical outline the retriever navigates.
 * `summary=1` adds per-node summaries; `text=1` inlines node text.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/docs/[docId]/tree">,
) {
  try {
    const { docId } = await ctx.params;
    const params = searchParams(request);
    return jsonResponse(
      await getTree(docId, {
        summary: params.get("summary") !== "0",
        includeText: params.get("text") === "1",
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

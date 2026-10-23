import { getBlock } from "@/lib/pageindex/client";
import { errorResponse, jsonResponse } from "@/lib/server/http";

/**
 * GET /api/docs/:docId/block/:blockId
 *
 * One layout block behind a block-level citation: page, bbox (thousandths of
 * page width/height, origin top-left) and the block's text. Only documents
 * indexed with the `block_reference` beta have blocks; older documents 404,
 * which the reader treats as "page-level citation only".
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/docs/[docId]/block/[blockId]">,
) {
  try {
    const { docId, blockId } = await ctx.params;
    return jsonResponse(await getBlock(docId, blockId));
  } catch (error) {
    return errorResponse(error);
  }
}

import { deleteDocument, getDocument } from "@/lib/pageindex/client";
import { errorResponse, jsonResponse } from "@/lib/server/http";

/** GET /api/docs/:docId — document metadata. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/docs/[docId]">,
) {
  try {
    const { docId } = await ctx.params;
    return jsonResponse(await getDocument(docId));
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/docs/:docId — remove the document and all derived data. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/docs/[docId]">,
) {
  try {
    const { docId } = await ctx.params;
    await deleteDocument(docId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

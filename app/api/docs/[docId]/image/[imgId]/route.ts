import { getDocumentImageUrl } from "@/lib/pageindex/client";
import { errorResponse } from "@/lib/server/http";
import { documentNotFound, findDocument } from "@/lib/server/documents";
import { requireTenant } from "@/lib/server/tenant";

/**
 * GET /api/docs/:docId/image/:imgId
 *
 * Figures inside page markdown arrive as bare ids (`img-7.jpeg`). This route
 * resolves the presigned URL and redirects to it, so `<img>` tags in OCR
 * markdown just work without proxying image bytes through the app.
 */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/docs/[docId]/image/[imgId]">,
) {
  const { tenantId } = await requireTenant();

  try {
    const { docId, imgId } = await ctx.params;
    if (!(await findDocument(tenantId, docId))) return documentNotFound();
    const url = await getDocumentImageUrl(docId, decodeURIComponent(imgId));
    if (!url) {
      return Response.json(
        { error: "Image not found", code: "NOT_FOUND", status: 404 },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

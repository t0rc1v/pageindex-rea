import { auth } from "@clerk/nextjs/server";

import { deleteDocument, getDocument, updateDocumentMetadata } from "@/lib/pageindex/client";
import { errorResponse, jsonResponse } from "@/lib/server/http";

/** GET /api/docs/:docId — document metadata. */
export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/docs/[docId]">,
) {
  await auth.protect();

  try {
    const { docId } = await ctx.params;
    return jsonResponse(await getDocument(docId));
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/docs/:docId — rename / edit the description. */
export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/docs/[docId]">,
) {
  await auth.protect();

  try {
    const { docId } = await ctx.params;
    const body = (await request.json()) as { name?: unknown; description?: unknown };
    if (body.name !== undefined && typeof body.name !== "string") {
      return jsonResponse(
        { error: "`name` must be a string.", code: "INTERNAL", status: 400 },
        { status: 400 },
      );
    }
    const updated = await updateDocumentMetadata(docId, {
      ...(typeof body.name === "string" ? { name: body.name } : {}),
      ...(body.description === null || typeof body.description === "string"
        ? { description: body.description }
        : {}),
    });
    return jsonResponse(updated);
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/docs/:docId — remove the document and all derived data. */
export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/docs/[docId]">,
) {
  await auth.protect();

  try {
    const { docId } = await ctx.params;
    await deleteDocument(docId);
    return jsonResponse({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

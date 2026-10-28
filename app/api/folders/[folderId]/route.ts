import { z } from "zod";

import { deleteFolder } from "@/lib/server/folders";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { requireTenant } from "@/lib/server/tenant";

/**
 * DELETE /api/folders/:folderId
 *
 * Folders are workspace metadata, so removing one only unfiles the documents
 * inside (`documents.folder_id ON DELETE SET NULL`) and removes nested folders.
 * The library UI does not expose this yet; it exists so a workspace can be
 * cleaned up — by a person or by the test suite.
 */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/folders/[folderId]">) {
  const { tenantId } = await requireTenant();

  try {
    const parsed = z.uuid().safeParse((await ctx.params).folderId);
    if (!parsed.success) {
      return jsonResponse(
        { error: "Folder not found.", code: "NOT_FOUND", status: 404 },
        { status: 404 },
      );
    }

    return (await deleteFolder(tenantId, parsed.data))
      ? new Response(null, { status: 204 })
      : jsonResponse(
          { error: "Folder not found.", code: "NOT_FOUND", status: 404 },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error);
  }
}

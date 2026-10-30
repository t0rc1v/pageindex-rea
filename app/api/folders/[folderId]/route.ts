import { z } from "zod";

import { deleteFolder, updateFolder, toFolderResponse } from "@/lib/server/folders";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { requireTenant } from "@/lib/server/tenant";

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(1000).nullish(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined, {
    message: "Nothing to update.",
  });

/**
 * PATCH /api/folders/:folderId
 *
 * Rename or re-describe one workspace folder. Organisation is local metadata,
 * so nothing here reaches the account-global upstream folders.
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/folders/[folderId]">) {
  const { tenantId } = await requireTenant();

  try {
    const parsedId = z.uuid().safeParse((await ctx.params).folderId);
    if (!parsedId.success) {
      return jsonResponse(
        { error: "Folder not found.", code: "NOT_FOUND", status: 404 },
        { status: 404 },
      );
    }

    const parsed = updateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonResponse(
        { error: "A folder name is required.", code: "INTERNAL", status: 400 },
        { status: 400 },
      );
    }

    const folder = await updateFolder(tenantId, parsedId.data, {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description ?? null }
        : {}),
    });

    return folder
      ? jsonResponse(toFolderResponse(folder))
      : jsonResponse(
          { error: "Folder not found.", code: "NOT_FOUND", status: 404 },
          { status: 404 },
        );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/folders/:folderId
 *
 * Folders are workspace metadata, so removing one only unfiles the documents
 * inside (`documents.folder_id ON DELETE SET NULL`) and removes nested folders.
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

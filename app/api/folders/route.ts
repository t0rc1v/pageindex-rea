import { z } from "zod";

import { createFolder, listFolders, toFolderResponse } from "@/lib/server/folders";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { requireTenant } from "@/lib/server/tenant";

/**
 * Workspace folders for the calling tenant.
 *
 * Deliberately local: the upstream `/folders` API is account-global, so proxying
 * it would let one workspace see and mutate another's folder tree.
 */

/** GET /api/folders — flat list with per-folder document counts. */
export async function GET() {
  const { tenantId } = await requireTenant();

  try {
    const folders = await listFolders(tenantId);
    return jsonResponse({ folders: folders.map(toFolderResponse), total: folders.length });
  } catch (error) {
    return errorResponse(error);
  }
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(1000).nullish(),
  parentFolderId: z.uuid().nullish(),
});

/** POST /api/folders — create one, optionally nested. */
export async function POST(request: Request) {
  const { tenantId } = await requireTenant();

  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonResponse(
        { error: "A folder name is required.", code: "INTERNAL", status: 400 },
        { status: 400 },
      );
    }

    const folder = await createFolder(tenantId, {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      parentFolderId: parsed.data.parentFolderId ?? null,
    });

    if (!folder) {
      return jsonResponse(
        { error: "That parent folder does not exist.", code: "NOT_FOUND", status: 404 },
        { status: 404 },
      );
    }

    return jsonResponse(toFolderResponse(folder));
  } catch (error) {
    return errorResponse(error);
  }
}

import { createFolder, listFolders } from "@/lib/pageindex/client";
import { errorResponse, jsonResponse, searchParams } from "@/lib/server/http";

/** GET /api/folders — workspaces ("folders") in the PageIndex account. */
export async function GET(request: Request) {
  try {
    const parent = searchParams(request).get("parent");
    return jsonResponse(await listFolders(parent ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/folders — create a folder. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: unknown;
      description?: unknown;
      parentFolderId?: unknown;
    };
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return jsonResponse(
        { error: "A folder name is required.", code: "INTERNAL", status: 400 },
        { status: 400 },
      );
    }
    return jsonResponse(
      await createFolder({
        name,
        description:
          typeof body.description === "string" && body.description.trim()
            ? body.description.trim()
            : undefined,
        parentFolderId:
          typeof body.parentFolderId === "string" && body.parentFolderId
            ? body.parentFolderId
            : undefined,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

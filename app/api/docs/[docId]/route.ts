import { deleteDocument, getDocument } from "@/lib/pageindex/client";
import {
  countOtherOwners,
  findDocument,
  forgetDocument,
  renameDocument,
  setDocumentDescription,
  setDocumentPageCount,
} from "@/lib/server/documents";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { requireTenant } from "@/lib/server/tenant";

/**
 * Every handler here resolves the id through the ownership registry first. A
 * document that exists upstream but not in this tenant answers 404 — not 403,
 * which would confirm that someone else's document lives at that id.
 */
const notFound = () =>
  jsonResponse({ error: "Document not found.", code: "NOT_FOUND", status: 404 }, { status: 404 });

/** GET /api/docs/:docId — document metadata. */
export async function GET(_request: Request, ctx: RouteContext<"/api/docs/[docId]">) {
  const { tenantId } = await requireTenant();

  try {
    const { docId } = await ctx.params;
    const owned = await findDocument(tenantId, docId);
    if (!owned) return notFound();

    const document = await getDocument(docId);

    // Keep the registry's page count in step with what upstream now reports, so
    // the library does not need a second request per row later.
    if (typeof document.pageNum === "number" && document.pageNum > 0 && document.pageNum !== owned.pageCount) {
      await setDocumentPageCount(tenantId, docId, document.pageNum);
    }

    return jsonResponse(document);
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PATCH /api/docs/:docId — rename / edit the description.
 *
 * Both are **local**. The upstream name is an account-global key: renaming it
 * would change another tenant's citations and break their MCP tool calls, and a
 * shared description is someone else's edit. PageIndex keeps its name; this
 * workspace keeps the one the user chose, and the two are reconciled at the two
 * edges that need it (MCP tool arguments and managed-lane citations).
 */
export async function PATCH(request: Request, ctx: RouteContext<"/api/docs/[docId]">) {
  const { tenantId } = await requireTenant();

  try {
    const { docId } = await ctx.params;
    if (!(await findDocument(tenantId, docId))) return notFound();

    const body = (await request.json()) as { name?: unknown; description?: unknown };
    if (body.name !== undefined && typeof body.name !== "string") {
      return jsonResponse(
        { error: "`name` must be a string.", code: "INTERNAL", status: 400 },
        { status: 400 },
      );
    }

    const name = typeof body.name === "string" ? body.name.trim().slice(0, 300) : "";
    if (name) await renameDocument(tenantId, docId, name);

    if (body.description === null || typeof body.description === "string") {
      await setDocumentDescription(
        tenantId,
        docId,
        body.description === null ? null : body.description.slice(0, 2_000),
      );
    }

    const owned = await findDocument(tenantId, docId);
    return jsonResponse({
      id: docId,
      name: owned?.name ?? name,
      description: body.description === undefined ? undefined : body.description,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/docs/:docId — remove the document and all derived data. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/docs/[docId]">) {
  const { tenantId } = await requireTenant();

  try {
    const { docId } = await ctx.params;
    if (!(await findDocument(tenantId, docId))) return notFound();

    // The upstream file is shared: only destroy it once no other tenant lists
    // it, otherwise "delete mine" would delete someone else's document.
    const shared = await countOtherOwners(docId, tenantId);
    await forgetDocument(tenantId, docId);
    if (shared === 0) await deleteDocument(docId);

    return jsonResponse({ ok: true, upstreamDeleted: shared === 0 });
  } catch (error) {
    return errorResponse(error);
  }
}

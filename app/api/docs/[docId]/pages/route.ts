import { getPages } from "@/lib/pageindex/client";
import { errorResponse, intParam, jsonResponse, searchParams } from "@/lib/server/http";
import { forgetPages, readPages, writePages } from "@/lib/server/pages-cache";

/**
 * GET /api/docs/:docId/pages?from=1&to=3&images=0
 *
 * PageIndex returns OCR for the whole document at once; this route slices the
 * requested window so the reader can page through a 700-page book without
 * shipping every page to the browser.
 */
export async function GET(
  request: Request,
  ctx: RouteContext<"/api/docs/[docId]/pages">,
) {
  try {
    const { docId } = await ctx.params;
    const params = searchParams(request);
    const from = intParam(params.get("from"), 1, 1, 100_000);
    const to = Math.max(from, intParam(params.get("to"), from, 1, 100_000));
    const includeImages = params.get("images") === "1";

    if (params.get("refresh") === "1") forgetPages(docId);

    // Presigned image URLs expire, so an images=1 request always goes
    // upstream and is never served from (or written to) the cache.
    let pages = includeImages ? undefined : readPages(docId);
    let status: string = "completed";
    let retrievalReady: boolean | undefined;

    if (!pages) {
      const response = await getPages(docId, { includeImages });
      pages = response.result ?? [];
      status = String(response.status ?? "unknown");
      retrievalReady = response.retrieval_ready;
      if (!includeImages && pages.length > 0) writePages(docId, pages);
    }

    const pageCount = pages.reduce(
      (max, page) => Math.max(max, page.page_index ?? 0),
      0,
    );

    const window = pages
      .filter((page) => page.page_index >= from && page.page_index <= to)
      .map((page) => ({
        page_index: page.page_index,
        markdown: page.markdown ?? "",
        ...(includeImages && page.images?.length ? { images: page.images } : {}),
        ...(page.blocks?.length ? { blocks: page.blocks } : {}),
      }));

    return jsonResponse({
      doc_id: docId,
      status,
      ...(retrievalReady === undefined ? {} : { retrieval_ready: retrievalReady }),
      pageCount,
      from,
      to,
      pages: window,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

"use client";

/**
 * A page pinned into a question.
 *
 * Pinned pages are *additive*: the request still carries `docIds`, so the whole
 * document stays in scope and the model can walk it. What the pin buys is aim —
 * "what does this table mean?" is answered against the page on screen — and a
 * saved round trip, because the text is already in the prompt.
 */
export interface PageContext {
  docId: string;
  docName: string;
  page: number;
  text: string;
}

/**
 * Read one page's text, ready to pin.
 *
 * Shared by `/chat`'s *Add Page to Chat* and by the reader's automatic pin, so
 * the two cannot disagree about what "the page" means or how an empty page is
 * reported.
 */
export async function fetchPageContext({
  docId,
  docName,
  page,
}: {
  docId: string;
  docName: string;
  page: number;
}): Promise<PageContext> {
  const response = await fetch(
    `/api/docs/${encodeURIComponent(docId)}/pages?from=${page}&to=${page}`,
  );
  if (!response.ok) throw new Error(`Page fetch failed (${response.status})`);

  const payload = (await response.json()) as { pages?: Array<{ markdown?: string }> };
  const text = payload.pages?.[0]?.markdown ?? "";
  if (!text.trim()) throw new Error("That page has no text to attach");

  return { docId, docName, page, text };
}

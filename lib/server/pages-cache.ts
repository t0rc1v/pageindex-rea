import type { PageContent } from "@/lib/pageindex/types";

/**
 * Page content for one document arrives as a single OCR payload covering
 * every page, while the reader only needs the pages currently on screen.
 * We cache the parsed result briefly so paging around does not re-download a
 * 700-page markdown body on every click.
 *
 * Bounded by entry count and total characters: this is a convenience cache,
 * never a source of truth.
 */
const MAX_DOCS = 3;
const MAX_TOTAL_CHARS = 12_000_000;
const TTL_MS = 5 * 60 * 1000;

interface Entry {
  pages: PageContent[];
  totalChars: number;
  storedAt: number;
}

const store = new Map<string, Entry>();
let totalChars = 0;

function evictExpired(now: number) {
  for (const [docId, entry] of store) {
    if (now - entry.storedAt > TTL_MS) {
      totalChars -= entry.totalChars;
      store.delete(docId);
    }
  }
}

export function readPages(docId: string): PageContent[] | undefined {
  const now = Date.now();
  evictExpired(now);
  const entry = store.get(docId);
  if (!entry) return undefined;
  // refresh recency
  store.delete(docId);
  store.set(docId, entry);
  return entry.pages;
}

export function writePages(docId: string, pages: PageContent[]): void {
  const now = Date.now();
  evictExpired(now);

  const chars = pages.reduce(
    (sum, page) => sum + (page.markdown?.length ?? 0),
    0,
  );
  if (chars > MAX_TOTAL_CHARS) return; // too large to be worth caching

  const previous = store.get(docId);
  if (previous) totalChars -= previous.totalChars;

  store.set(docId, { pages, totalChars: chars, storedAt: now });
  totalChars += chars;

  while (store.size > MAX_DOCS || totalChars > MAX_TOTAL_CHARS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    const entry = store.get(oldest);
    if (entry) totalChars -= entry.totalChars;
    store.delete(oldest);
    if (oldest === docId) break;
  }
}

export function forgetPages(docId: string): void {
  const entry = store.get(docId);
  if (!entry) return;
  totalChars -= entry.totalChars;
  store.delete(docId);
}

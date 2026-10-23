import type { Citation } from "./pageindex/types";

/**
 * PageIndex chat cites sources inline in one of two tag formats. Both are
 * copied from the official SDK's parser (pageindex/client.py, `_parse_citations`)
 * so our rendering matches what the API guarantees:
 *
 *   <doc=Annual Report.pdf;page=12;block=p12_text_3>
 *   <cite doc="Annual Report.pdf" page="12" block="p12_text_3"/>
 *
 * A page-only tag (no block) is legitimate: it happens for legacy documents
 * and for structure outlines, where no block ids exist.
 */
const OLD_CITATION = /<doc=([^;<>]+);page=(\d+(?:-\d+)?)(?:;block(?:_id)?=([^;<>]+))?>/g;
const CITE_TAG = /<cite\s([^<>]*)>(?:([^<>]*)<\/cite>)?/g;
const CITE_ATTR = /\b(\w+)=(["'])([^"']*)\2/g;

function normalize(document: string, page: string, blockId?: string) {
  const name = document.trim();
  const pageNumber = Number.parseInt(page.split("-")[0] ?? "", 10);
  if (!name || !Number.isFinite(pageNumber) || pageNumber <= 0) return null;
  return {
    document: name,
    page: pageNumber,
    blockId: blockId?.trim() || undefined,
  };
}

/** Stable identity for a citation: document + page + block. */
export function citationKey(citation: Citation): string {
  return `${citation.document}\u0000${citation.page}\u0000${citation.blockId ?? ""}`;
}

/** All distinct citations in an answer, in first-appearance order. */
export function parseCitations(text: string): Citation[] {
  const found: Citation[] = [];
  const seen = new Set<string>();

  const push = (citation: Citation | null) => {
    if (!citation) return;
    const key = citationKey(citation);
    if (seen.has(key)) return;
    seen.add(key);
    found.push(citation);
  };

  for (const match of text.matchAll(OLD_CITATION)) {
    push(normalize(match[1] ?? "", match[2] ?? "", match[3]));
  }

  for (const match of text.matchAll(CITE_TAG)) {
    const attrs: Record<string, string> = {};
    for (const attr of (match[1] ?? "").matchAll(CITE_ATTR)) {
      attrs[attr[1]!] = attr[3] ?? "";
    }
    push(normalize(attrs.doc ?? "", attrs.page ?? "", attrs.block));
  }

  return found;
}

export type CitationSegment =
  | { kind: "text"; text: string }
  | { kind: "citation"; citation: Citation; raw: string };

/**
 * Split answer text into prose and citation chips. Citation tags are removed
 * from the prose so they never render as raw markup.
 */
export function tokenizeCitations(text: string): CitationSegment[] {
  const segments: CitationSegment[] = [];
  const matches: Array<{ start: number; end: number; citation: Citation; raw: string }> = [];

  for (const match of text.matchAll(OLD_CITATION)) {
    const citation = normalize(match[1] ?? "", match[2] ?? "", match[3]);
    if (!citation) continue;
    matches.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      citation,
      raw: match[0],
    });
  }

  for (const match of text.matchAll(CITE_TAG)) {
    const attrs: Record<string, string> = {};
    for (const attr of (match[1] ?? "").matchAll(CITE_ATTR)) {
      attrs[attr[1]!] = attr[3] ?? "";
    }
    const citation = normalize(attrs.doc ?? "", attrs.page ?? "", attrs.block);
    if (!citation) continue;
    matches.push({
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      citation,
      raw: match[0],
    });
  }

  matches.sort((a, b) => a.start - b.start);

  let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue; // overlapping tag, keep the first
    if (match.start > cursor) {
      segments.push({ kind: "text", text: text.slice(cursor, match.start) });
    }
    segments.push({ kind: "citation", citation: match.citation, raw: match.raw });
    cursor = match.end;
  }
  if (cursor < text.length) {
    segments.push({ kind: "text", text: text.slice(cursor) });
  }
  return segments;
}

/**
 * While an answer streams, a tag can arrive in pieces. Hold back any trailing
 * fragment that may still become a citation tag so the reader never sees
 * half a tag flicker on screen.
 */
export function splitStreamingTail(text: string): {
  stable: string;
  pending: string;
} {
  const lastOpen = text.lastIndexOf("<");
  if (lastOpen === -1) return { stable: text, pending: "" };

  const tail = text.slice(lastOpen);
  if (tail.includes(">")) return { stable: text, pending: "" };

  const looksLikeCitation = /^<(d|do|doc=|c|ci|cit|cite\b)/i.test(tail);
  if (!looksLikeCitation) return { stable: text, pending: "" };

  return { stable: text.slice(0, lastOpen), pending: tail };
}

/**
 * Attach document ids to citations by matching the cited document *name*
 * against the documents the conversation is scoped to.
 */
export function resolveCitationDocs(
  citations: Citation[],
  docs: Array<{ id: string; name: string }>,
): Citation[] {
  return citations.map((citation) => {
    const wanted = citation.document.trim().toLowerCase();
    const match =
      docs.find((doc) => doc.name.trim().toLowerCase() === wanted) ??
      (docs.length === 1 ? docs[0] : undefined);
    return match ? { ...citation, docId: match.id } : citation;
  });
}

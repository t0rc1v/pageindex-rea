"use client";

import Link from "next/link";
import { useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import type { BlockResponse, Citation } from "@/lib/pageindex/types";
import { Markdown } from "@/components/markdown";
import { Button, Skeleton, cn } from "@/components/ui-kit";
import { HighlightBox } from "./citation-card";

interface PagesPayload {
  pages: Array<{ page_index: number; markdown: string }>;
  pageCount: number;
}

/**
 * The "artifact": the cited document opened beside the conversation, on the
 * cited page, with the cited block outlined — the same page the official app
 * opens from a citation's Open page action.
 */
export function ArtifactPanel({
  citation,
  onClose,
  className,
}: {
  citation: Citation;
  onClose: () => void;
  className?: string;
}) {
  const [page, setPage] = useState(citation.page);
  const docId = citation.docId;
  const blockId = page === citation.page ? citation.blockId : undefined;
  const bbox = page === citation.page ? citation.bbox : undefined;

  const image = useFetch<{ url: string }>(
    docId ? `/api/docs/${encodeURIComponent(docId)}/image?page=${page}` : null,
  );
  const block = useFetch<BlockResponse>(
    docId && blockId
      ? `/api/docs/${encodeURIComponent(docId)}/block/${encodeURIComponent(blockId)}`
      : null,
  );
  const content = useFetch<PagesPayload>(
    docId ? `/api/docs/${encodeURIComponent(docId)}/pages?from=${page}&to=${page}` : null,
  );

  const highlight = bbox ?? block.data?.bbox;
  const pageText = content.data?.pages[0]?.markdown ?? "";
  const total = content.data?.pageCount;

  if (!docId) {
    return null;
  }

  return (
    <section
      className={cn(
        "flex min-h-0 flex-col border-line bg-surface",
        className,
      )}
      aria-label="Cited document"
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-ink" title={citation.document}>
            {citation.document}
          </p>
          <p className="font-mono text-[10px] text-ink-muted">
            {blockId ? `${blockId} · page ${page}` : `page ${page}`}
            {total ? ` / ${total}` : ""}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-lg border border-line">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={page <= 1}
              className="h-7 cursor-pointer px-2 text-[11px] text-ink-muted hover:text-ink disabled:opacity-40"
            >
              ←
            </button>
            <span className="px-1 font-mono text-[10px] tabular-nums text-ink-muted">{page}</span>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => setPage((value) => value + 1)}
              disabled={total ? page >= total : false}
              className="h-7 cursor-pointer px-2 text-[11px] text-ink-muted hover:text-ink disabled:opacity-40"
            >
              →
            </button>
          </div>
          <Link
            href={`/doc/${encodeURIComponent(docId)}?page=${page}${blockId ? `&block=${encodeURIComponent(blockId)}` : ""}`}
            className="hidden h-8 items-center rounded-lg border border-line px-2 text-[11px] text-ink hover:bg-paper sm:inline-flex"
          >
            Reader
          </Link>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close document">
            ✕
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="relative overflow-hidden rounded-lg border border-line bg-white">
          {image.data?.url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.data.url} alt={`Page ${page}`} className="block w-full" />
              {highlight && <HighlightBox bbox={highlight} className="border-2" />}
            </>
          ) : image.loading ? (
            <Skeleton className="h-[52vh] w-full" />
          ) : (
            <p className="p-3 text-[12px] text-ink-muted">No page render available.</p>
          )}
        </div>

        {block.data?.text && (
          <blockquote className="mt-3 border-l-2 border-brand pl-2.5 font-serif text-[13px] leading-relaxed text-ink">
            {block.data.text}
          </blockquote>
        )}

        <div className="mt-3">
          {pageText ? (
            <Markdown docId={docId} className="md-body-compact text-[12.5px]">
              {pageText}
            </Markdown>
          ) : content.loading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-10/12" />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

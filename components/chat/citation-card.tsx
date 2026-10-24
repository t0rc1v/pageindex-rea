"use client";

import { useEffect, useMemo, useRef } from "react";

import { useFetch } from "@/lib/client/hooks";
import type { BlockResponse, Citation, PageIndexDocument } from "@/lib/pageindex/types";
import { Spinner, cn } from "@/components/ui-kit";

export interface CitationAnchor {
  citation: Citation;
  rect: { left: number; top: number; width: number; height: number };
}

/**
 * The citation preview: what the official app shows when you hover a citation
 * on desktop, or tap one on mobile — the cited page, the block's own text, and
 * a way into the document.
 *
 * Positioned from the chip's rect and clamped to the viewport; on small screens
 * it becomes a bottom sheet instead of a floating card.
 */
export function CitationCard({
  anchor,
  onClose,
  onOpenPage,
}: {
  anchor: CitationAnchor;
  onClose: () => void;
  onOpenPage: (citation: Citation) => void;
}) {
  const { citation } = anchor;
  const cardRef = useRef<HTMLDivElement | null>(null);

  const canLoad = Boolean(citation.docId);
  const block = useFetch<BlockResponse>(
    canLoad && citation.blockId
      ? `/api/docs/${encodeURIComponent(citation.docId!)}/block/${encodeURIComponent(citation.blockId)}`
      : null,
  );
  const image = useFetch<{ url: string }>(
    canLoad
      ? `/api/docs/${encodeURIComponent(citation.docId!)}/image?page=${citation.page}`
      : null,
  );
  const page = useFetch<{ pages: Array<{ page_index: number; markdown: string }> }>(
    canLoad && !citation.blockId
      ? `/api/docs/${encodeURIComponent(citation.docId!)}/pages?from=${citation.page}&to=${citation.page}`
      : null,
  );
  const meta = useFetch<PageIndexDocument>(
    canLoad ? `/api/docs/${encodeURIComponent(citation.docId!)}` : null,
  );

  const bbox = citation.bbox ?? block.data?.bbox;
  const snippet =
    block.data?.text ??
    (page.data?.pages[0]?.markdown ?? "").replace(/[#*>-]/g, "").slice(0, 320);
  const blockType = citation.blockType ?? block.data?.block_type;
  // PageIndex labels a figure's own block "caption"; the wording is the only
  // signal that it belongs to a figure or a table.
  const kind = blockKind(blockType, snippet);
  // A figure or table is more useful cropped than as a whole page.
  const crop = kind !== "text" && bbox ? bbox : null;
  const totalPages = meta.data?.pageNum;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const style = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    // Phones get a bottom sheet. Driven from inline geometry rather than
    // breakpoint utilities so it cannot be overridden by a stale class merge.
    if (window.innerWidth < 640) {
      return {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        top: "auto",
        width: "auto",
        maxHeight: "82dvh",
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      } as React.CSSProperties;
    }
    const width = 352;
    const margin = 12;
    const left = Math.min(
      Math.max(margin, anchor.rect.left + anchor.rect.width / 2 - width / 2),
      window.innerWidth - width - margin,
    );
    const below = anchor.rect.top + anchor.rect.height + 8;
    const estimated = 300;
    const top =
      below + estimated > window.innerHeight - margin
        ? Math.max(margin, anchor.rect.top - estimated - 8)
        : below;
    return { position: "fixed", left, top, width } as React.CSSProperties;
  }, [anchor]);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Citation details"
      className={cn(
        "z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_12px_40px_rgba(23,22,21,0.18)]",
      )}
      style={style}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-ink" title={citation.document}>
            {citation.document}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
            <span>
              Page {citation.page}
              {totalPages ? ` of ${totalPages}` : ""}
            </span>
            {blockType && (
              <span className="rounded border border-line bg-paper px-1 py-px text-[10px]">
                {blockLabel(blockType, snippet)}
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close citation preview"
          className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted hover:bg-ink/5 hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="flex gap-3 p-3">
        <div
          className={cn(
            "relative shrink-0 overflow-hidden rounded-md border border-line bg-white",
            crop ? "w-24" : "w-20",
          )}
        >
          {image.data?.url && crop ? (
            <div
              role="img"
              aria-label={`${kind} on page ${citation.page}`}
              className="block w-full"
              style={{
                aspectRatio: `${Math.max(1, crop[2] - crop[0])} / ${Math.max(1, crop[3] - crop[1])}`,
                backgroundImage: `url(${image.data.url})`,
                backgroundSize: `${(1000 / Math.max(1, crop[2] - crop[0])) * 100}% ${(1000 / Math.max(1, crop[3] - crop[1])) * 100}%`,
                backgroundPosition: `${crop[2] >= 1000 ? 0 : (crop[0] / (1000 - (crop[2] - crop[0]))) * 100}% ${crop[3] >= 1000 ? 0 : (crop[1] / (1000 - (crop[3] - crop[1]))) * 100}%`,
                backgroundRepeat: "no-repeat",
              }}
            />
          ) : image.data?.url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.data.url} alt={`Page ${citation.page}`} className="block w-full" />
              {bbox && <HighlightBox bbox={bbox} />}
            </>
          ) : (
            <div className="flex h-28 items-center justify-center">
              {image.loading ? <Spinner className="size-3 text-ink-muted" /> : <span className="text-[10px] text-ink-muted">no preview</span>}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {!canLoad ? (
            <p className="text-[12px] leading-relaxed text-ink-muted">
              This citation names a document outside the current scope, so the
              app cannot open it here.
            </p>
          ) : snippet ? (
            <p className="line-clamp-5 font-serif text-[12.5px] leading-relaxed text-ink/90">
              {snippet}
            </p>
          ) : block.loading ? (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
              <Spinner className="size-3" /> Loading the cited block…
            </div>
          ) : (
            <p className="text-[12px] leading-relaxed text-ink-muted">
              {citation.blockId
                ? "This block could not be read (the document may predate block references)."
                : "This document has no block-level data for the citation."}
            </p>
          )}

          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => onOpenPage(citation)}
              disabled={!canLoad}
              className="cursor-pointer rounded-md px-1.5 py-1 text-[11.5px] text-brand-deep transition-colors hover:bg-brand-soft disabled:cursor-default disabled:opacity-40"
            >
              Open page ↗
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type BlockKind = "text" | "figure" | "table";

function blockKind(value: string | undefined, text?: string): BlockKind {
  if (value && /image|figure|chart|diagram|photo/.test(value)) return "figure";
  if (value && /table/.test(value)) return "table";
  const lead = (text ?? "").trimStart().slice(0, 40);
  if (/^(figure|fig\.)\s*\d/i.test(lead)) return "figure";
  if (/^table\s*\d/i.test(lead)) return "table";
  return "text";
}

const BLOCK_LABELS: Record<string, string> = {
  text: "Text block",
  table: "Table",
  image: "Image",
  figure: "Figure",
  list: "List",
  title: "Heading",
  header: "Header",
  footer: "Footer",
  toc: "Contents",
};

function blockLabel(value: string, text?: string): string {
  const kind = blockKind(value, text);
  if (kind === "figure") return "Cited figure";
  if (kind === "table") return "Cited table";
  return BLOCK_LABELS[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

export function HighlightBox({
  bbox,
  className,
}: {
  bbox: [number, number, number, number];
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute rounded-[2px] border border-brand bg-brand/20",
        className,
      )}
      style={{
        left: `${bbox[0] / 10}%`,
        top: `${bbox[1] / 10}%`,
        width: `${Math.max(0.6, (bbox[2] - bbox[0]) / 10)}%`,
        height: `${Math.max(0.4, (bbox[3] - bbox[1]) / 10)}%`,
      }}
    />
  );
}

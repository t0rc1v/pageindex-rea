"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import { CARD_WIDTH, placeCitationCard, type AnchorRect } from "@/lib/citation-placement";
import type { BlockResponse, Citation, PageIndexDocument } from "@/lib/pageindex/types";
import { Spinner, cn } from "@/components/ui-kit";

export interface CitationAnchor {
  citation: Citation;
  rect: AnchorRect;
  /**
   * The marker the preview points at. The card follows its live rect, so it
   * stays glued when the transcript (or the page) scrolls.
   */
  marker?: HTMLElement;
}

/**
 * The citation preview: what the official app shows when you hover a citation
 * on desktop, or tap one on mobile — the cited page, the block's own text, and
 * a way into the document.
 *
 * Positioned from the marker's live rect, so it follows scrolling and stays
 * clamped to the viewport; on small screens it becomes a bottom sheet instead
 * of a floating card.
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
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // The card's natural height, measured rather than guessed: flipping above the
  // chip is only symmetric if the gap uses the real height, and the content
  // (page image, snippet) grows after the first paint.
  const [height, setHeight] = useState(0);
  const closeRef = useRef(onClose);
  const placeRef = useRef<() => void>(() => {});

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

  // The preview points at a live marker, so it is placed by hand: scrolling
  // moves the marker, and routing every scroll frame through state would
  // re-render the card while the transcript moves.
  const place = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    const marker = anchor.marker;
    if (marker && !marker.isConnected) {
      // A re-render replaced the marker; there is nothing left to point at.
      closeRef.current();
      return;
    }
    const rect = marker ? marker.getBoundingClientRect() : anchor.rect;
    const viewport = { width: window.innerWidth, height: window.innerHeight };

    if (viewport.width < 640) {
      // Phones get a bottom sheet. Driven from inline geometry rather than
      // breakpoint utilities so it cannot be overridden by a stale class merge.
      Object.assign(card.style, {
        position: "fixed",
        left: "0px",
        right: "0px",
        bottom: "0px",
        top: "auto",
        width: "auto",
        maxHeight: "82dvh",
        borderBottomLeftRadius: "0px",
        borderBottomRightRadius: "0px",
      });
      return;
    }

    // A marker scrolled out of view has nothing to point at, and a card parked
    // on unrelated text is worse than none.
    if (rect.top > viewport.height || rect.top + rect.height < 0) {
      closeRef.current();
      return;
    }

    const placement = placeCitationCard(rect, { height, viewport, width: CARD_WIDTH });
    card.style.position = "fixed";
    card.style.left = `${placement.left}px`;
    card.style.top = `${placement.top}px`;
    card.style.width = `${placement.width}px`;
    card.style.maxHeight = placement.maxHeight ? `${placement.maxHeight}px` : "";
    card.style.right = "auto";
    card.style.bottom = "auto";
    card.style.borderBottomLeftRadius = "";
    card.style.borderBottomRightRadius = "";
  }, [anchor, height]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  // Kept in refs so the scroll listener below never calls a stale closure.
  useLayoutEffect(() => {
    closeRef.current = onClose;
    placeRef.current = place;
  });

  // Measured after the first placement so the width — which drives the text
  // wrap, and so the height — is already final.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const body = bodyRef.current;
      const cardHeight = card.getBoundingClientRect().height;
      // While the card is clamped to the viewport the body scrolls, so its own
      // box is the clipped height. Reading scrollHeight instead keeps the flip
      // decision on the natural size and stops measure/clamp feedback from
      // oscillating.
      const clipped = body ? body.scrollHeight - body.clientHeight > 1 : false;
      const natural =
        body && clipped
          ? cardHeight - body.getBoundingClientRect().height + body.scrollHeight
          : cardHeight;
      setHeight((current) => (Math.abs(current - natural) > 0.5 ? natural : current));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let frame = 0;
    const schedule = (event?: Event) => {
      // Scrolling inside the card is not the transcript moving.
      if (event?.target instanceof Node && cardRef.current?.contains(event.target)) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        placeRef.current();
      });
    };
    const onScroll = (event: Event) => schedule(event);
    const onResize = () => schedule();
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-label="Citation details"
      className={cn(
        "z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-[0_12px_40px_rgba(23,22,21,0.18)]",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-3 py-2">
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

      <div ref={bodyRef} className="flex min-h-0 items-start gap-3 overflow-y-auto p-3">
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

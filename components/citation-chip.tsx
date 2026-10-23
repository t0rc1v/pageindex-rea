"use client";

import type { Citation } from "@/lib/pageindex/types";
import { cn } from "./ui-kit";

export type CitationPreviewHandler = (
  citation: Citation,
  rect: { left: number; top: number; width: number; height: number },
) => void;

/**
 * Inline citation marker. Numbered per distinct source (same source reused
 * keeps its number), matching the SDK's `resolve_citations()` anchors.
 *
 * Hover (desktop) opens the preview card; click/tap opens it too, which is the
 * only gesture available on touch.
 */
export function CitationChip({
  citation,
  index,
  onPreview,
  compact,
}: {
  citation: Citation;
  index: number;
  onPreview?: CitationPreviewHandler;
  compact?: boolean;
}) {
  const title = citation.blockId
    ? `${citation.document} — page ${citation.page}, block ${citation.blockId}`
    : `${citation.document} — page ${citation.page}`;

  const open = (event: { currentTarget: HTMLElement }) => {
    if (!onPreview) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onPreview(citation, {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    });
  };

  const classes = cn(
    "mx-0.5 inline-flex translate-y-[-0.15em] items-center rounded-[5px] border border-brand/35 bg-brand-soft",
    "px-1 py-px align-baseline font-mono font-medium leading-none text-brand-deep transition-colors",
    compact ? "text-[9.5px]" : "text-[10px]",
    onPreview ? "cursor-pointer hover:border-brand/70 hover:bg-brand/15" : "cursor-default",
    !citation.blockId && "opacity-80",
  );

  if (!onPreview) {
    return (
      <span className={classes} title={title}>
        {index}
      </span>
    );
  }

  return (
    <button
      type="button"
      onMouseEnter={open}
      onFocus={open}
      onClick={open}
      title={title}
      aria-label={`Citation ${index}: ${title}`}
      className={cn(classes, "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand/50")}
    >
      {index}
    </button>
  );
}

/** Deduplicated, numbered citations for an answer. */
export function numberCitations(citations: Citation[]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const citation of citations) {
    const key = `${citation.document}|${citation.page}|${citation.blockId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(citation);
  }
  return out;
}

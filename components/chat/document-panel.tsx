"use client";

import { ChevronLeft, ChevronRight, Info, Paperclip, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import type { BlockResponse, PageIndexDocument } from "@/lib/pageindex/types";
import { Markdown } from "@/components/markdown";
import { Skeleton, cn } from "@/components/ui-kit";
import { PanelResizeHandle } from "@/components/panel-resize-handle";
import { usePanelWidth } from "@/hooks/use-panel-width";
import { HighlightBox } from "./citation-card";

export interface OpenDoc {
  docId: string;
  name: string;
  page: number;
  blockId?: string;
  bbox?: [number, number, number, number];
}

interface PagesPayload {
  pages: Array<{ page_index: number; markdown: string }>;
  pageCount: number;
}

const WIDTH_KEY = "pageindex-reader/panel-width";
const MIN_WIDTH = 360;
const MAX_WIDTH = 1024;

/**
 * The document beside the conversation.
 *
 * One tab per document, opened from a citation and remembering the last page
 * read in that document. Resizable on desktop; a full-height sheet below `lg`,
 * where the official app also replaces the inline panel with a viewer.
 */
export function DocumentPanel({
  docs,
  activeId,
  onActivate,
  onPage,
  onClose,
  onCloseAll,
  onAddPage,
  className,
}: {
  docs: OpenDoc[];
  activeId: string | null;
  onActivate: (docId: string) => void;
  onPage: (docId: string, page: number) => void;
  onClose: (docId: string) => void;
  onCloseAll: () => void;
  /** Pin the open page into the next question's context. */
  onAddPage?: (doc: OpenDoc) => void;
  className?: string;
}) {
  const width = usePanelWidth({
    storageKey: WIDTH_KEY,
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    initial: 460,
  });
  const [mode, setMode] = useState<"page" | "text">("page");
  const [infoOpen, setInfoOpen] = useState(false);

  const doc = docs.find((item) => item.docId === activeId) ?? docs[0] ?? null;
  const docId = doc?.docId ?? null;
  const page = doc?.page ?? 1;

  const meta = useFetch<PageIndexDocument>(docId ? `/api/docs/${encodeURIComponent(docId)}` : null);
  const image = useFetch<{ url: string }>(
    docId ? `/api/docs/${encodeURIComponent(docId)}/image?page=${page}` : null,
  );
  const content = useFetch<PagesPayload>(
    docId ? `/api/docs/${encodeURIComponent(docId)}/pages?from=${page}&to=${page}` : null,
  );
  const block = useFetch<BlockResponse>(
    docId && doc?.blockId
      ? `/api/docs/${encodeURIComponent(docId)}/block/${encodeURIComponent(doc.blockId)}`
      : null,
  );

  const total = content.data?.pageCount ?? meta.data?.pageNum;
  const highlight = block.data?.bbox ?? doc?.bbox;
  const pageText = content.data?.pages[0]?.markdown ?? "";

  const tabs = useMemo(
    () => docs.map((item) => ({ ...item, label: item.name.replace(/\.pdf$/i, "") })),
    [docs],
  );

  if (!doc || !docId) return null;

  return (
    <>
      {/* Mobile scrim */}
      <div className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm lg:hidden" aria-hidden onClick={onCloseAll} />

      <section
        aria-label="Document viewer"
        className={cn(
          "z-50 flex min-h-0 flex-col bg-surface",
          "fixed inset-x-0 bottom-0 top-8 rounded-t-2xl border border-line shadow-2xl",
          // `relative`, never `static`, at the docked breakpoint: the grip is
          // positioned on this panel's left edge, and `static` handed that
          // containing block back to the app shell, leaving the grip at the
          // content's left edge where dragging did nothing. `inset-auto` clears
          // the sheet's offsets, which a relative box would otherwise obey.
          "lg:relative lg:inset-auto lg:z-auto lg:h-full lg:w-[var(--panel-width)] lg:rounded-none lg:border-0 lg:border-l lg:shadow-none",
          className,
        )}
        style={width.style}
      >
        <PanelResizeHandle
          label="Resize document panel"
          width={width.width}
          min={width.min}
          max={width.max}
          onPointerDown={width.onPointerDown}
          onKeyDown={width.onKeyDown}
          className="hidden lg:block"
        />

        <header className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.docId}
                className={cn(
                  "group/tab flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] transition-colors",
                  tab.docId === docId ? "bg-paper text-ink" : "text-ink-muted hover:bg-paper/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMode("page");
                    setInfoOpen(false);
                    onActivate(tab.docId);
                  }}
                  className="max-w-[180px] cursor-pointer truncate text-left"
                  title={tab.name}
                >
                  {tab.label}
                </button>
                <button
                  type="button"
                  onClick={() => onClose(tab.docId)}
                  aria-label={`Close ${tab.name}`}
                  className="cursor-pointer rounded p-0.5 text-ink-muted opacity-0 transition-opacity hover:text-ink group-hover/tab:opacity-100 focus:opacity-100"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {onAddPage && (
              <button
                type="button"
                onClick={() => onAddPage(doc)}
                aria-label="Add page to chat"
                title="Add page to chat"
                className="cursor-pointer rounded-md p-1.5 text-ink-muted hover:bg-paper hover:text-ink"
              >
                <Paperclip className="size-3.5" aria-hidden />
              </button>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() => setInfoOpen((value) => !value)}
                aria-label="Document info"
                title="Document info"
                className="cursor-pointer rounded-md p-1.5 text-ink-muted hover:bg-paper hover:text-ink"
              >
                <Info className="size-3.5" aria-hidden />
              </button>
              {infoOpen && (
                <div className="absolute right-0 top-8 z-30 w-72 rounded-xl border border-line bg-surface p-3 text-[11.5px] shadow-xl">
                  <p className="mb-1 font-medium text-ink">{meta.data?.name ?? doc.name}</p>
                  <dl className="flex flex-col gap-1 text-ink-muted">
                    <div className="flex justify-between gap-3">
                      <dt>Total pages</dt>
                      <dd className="font-mono">{meta.data?.pageNum ?? total ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt>Uploaded</dt>
                      <dd className="font-mono">
                        {meta.data?.createdAt
                          ? new Date(meta.data.createdAt).toLocaleDateString()
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  {meta.data?.description && (
                    <p className="mt-2 border-t border-line pt-2 leading-relaxed text-ink-muted">
                      {meta.data.description}
                    </p>
                  )}
                  <Link
                    href={`/doc/${encodeURIComponent(docId)}?page=${page}`}
                    className="mt-2 block rounded-md border border-line px-2 py-1 text-center text-[11px] text-ink hover:bg-paper"
                  >
                    Open full reader
                  </Link>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onCloseAll}
              aria-label="Close document"
              className="cursor-pointer rounded-md p-1.5 text-ink-muted hover:bg-paper hover:text-ink"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        </header>

        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-2 py-1">
          <div className="flex items-center rounded-lg border border-line p-0.5">
            {(["page", "text"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cn(
                  "cursor-pointer rounded px-2 py-0.5 text-[10.5px] capitalize transition-colors",
                  mode === value ? "bg-ink text-paper" : "text-ink-muted hover:text-ink",
                )}
              >
                {value}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              onClick={() => onPage(docId, Math.max(1, page - 1))}
              disabled={page <= 1}
              className="cursor-pointer rounded-md p-1 text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="font-mono text-[10.5px] tabular-nums text-ink-muted">
              {page}
              {total ? ` / ${total}` : ""}
            </span>
            <button
              type="button"
              aria-label="Next page"
              onClick={() => onPage(docId, total ? Math.min(total, page + 1) : page + 1)}
              disabled={Boolean(total) && page >= (total ?? 0)}
              className="cursor-pointer rounded-md p-1 text-ink-muted hover:bg-paper hover:text-ink disabled:opacity-30"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === "page" ? (
            <div className="relative m-2 overflow-hidden rounded-lg border border-line bg-white">
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
          ) : (
            <div className="px-3 py-2">
              {pageText ? (
                <Markdown docId={docId} className="md-body-compact text-[12.5px]">
                  {pageText}
                </Markdown>
              ) : content.loading ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-11/12" />
                </div>
              ) : (
                <p className="text-[12px] text-ink-muted">No text for this page.</p>
              )}
            </div>
          )}

          {block.data?.text && (
            <blockquote className="mx-2 mb-3 border-l-2 border-brand pl-2.5 font-serif text-[13px] leading-relaxed text-ink">
              {block.data.text}
            </blockquote>
          )}
        </div>
      </section>
    </>
  );
}

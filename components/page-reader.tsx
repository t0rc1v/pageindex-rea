"use client";

import { useEffect, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import type { BlockResponse, PageContent } from "@/lib/pageindex/types";
import { Markdown } from "./markdown";
import { Button, Skeleton, Spinner, cn } from "./ui-kit";

interface PagesPayload {
  pageCount: number;
  status: string;
  pages: PageContent[];
}

type Mode = "text" | "page";

/**
 * A page window of ±1 is requested at a time. That is deliberate: the server
 * slices the document's full OCR payload (cached for a few minutes), and one
 * step of paging is then already in hand, so next/previous render instantly.
 */
export function PageReader({
  docId,
  page,
  fallbackPageCount,
  blockId,
  onPage,
  onClearBlock,
  className,
}: {
  docId: string;
  page: number;
  fallbackPageCount?: number;
  blockId: string | null;
  onPage: (page: number) => void;
  onClearBlock: () => void;
  className?: string;
}) {
  const [mode, setMode] = useState<Mode>("text");
  const [draft, setDraft] = useState<string | null>(null);

  const from = Math.max(1, page - 1);
  const to = page + 1;

  const { data, loading, error } = useFetch<PagesPayload>(
    `/api/docs/${encodeURIComponent(docId)}/pages?from=${from}&to=${to}`,
  );

  const current = data?.pages.find((item) => item.page_index === page);
  const total = data?.pageCount ?? fallbackPageCount ?? 0;
  const jump = draft ?? String(page);

  const go = (next: number) => {
    setDraft(null);
    onPage(next);
  };

  // Arrow-key paging, unless the reader is typing.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.key === "ArrowRight" && (total === 0 || page < total)) {
        onPage(page + 1);
      } else if (event.key === "ArrowLeft" && page > 1) {
        onPage(page - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [page, total, onPage]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ←
          </Button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const next = Number.parseInt(jump, 10);
              if (Number.isFinite(next)) {
                go(Math.min(Math.max(1, next), Math.max(1, total || next)));
              }
            }}
            className="flex items-center gap-1 text-[12px] text-ink-muted"
          >
            <input
              value={jump}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => setDraft(null)}
              inputMode="numeric"
              aria-label="Page number"
              className="h-8 w-12 rounded-lg border border-line bg-surface text-center font-mono text-[12px] text-ink outline-none focus:border-ink/40"
            />
            <span className="tabular-nums">of {total || "—"}</span>
          </form>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => go(page + 1)}
            disabled={total > 0 && page >= total}
            aria-label="Next page"
          >
            →
          </Button>
        </div>

        <div className="flex items-center gap-1">
          {blockId && (
            <Button size="sm" variant="ghost" onClick={onClearBlock}>
              Clear highlight
            </Button>
          )}
          <div className="flex rounded-lg border border-line p-0.5">
            {(["text", "page"] as Mode[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
                  mode === option ? "bg-ink text-paper" : "text-ink-muted hover:text-ink",
                )}
              >
                {option === "text" ? "Text" : "Page"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-5 py-6">
          {blockId && <BlockCallout docId={docId} blockId={blockId} mode={mode} />}

          {error ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] text-red-900">
              {error.message}
            </p>
          ) : mode === "page" ? (
            <PageImage docId={docId} page={page} blockId={blockId} />
          ) : current ? (
            <article>
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-muted">
                Page {page}
              </p>
              {current.markdown?.trim() ? (
                <Markdown docId={docId}>{current.markdown}</Markdown>
              ) : (
                <p className="text-[13px] text-ink-muted">
                  No text extracted for this page. Switch to the page image.
                </p>
              )}
            </article>
          ) : loading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-10/12" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <p className="text-[13px] text-ink-muted">Page {page} is not in this document.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockCallout({
  docId,
  blockId,
  mode,
}: {
  docId: string;
  blockId: string;
  mode: Mode;
}) {
  const { data, error } = useFetch<BlockResponse>(
    `/api/docs/${encodeURIComponent(docId)}/block/${encodeURIComponent(blockId)}`,
  );

  if (error) {
    return (
      <p className="mb-4 rounded-xl border border-line bg-paper px-3 py-2 text-[12px] leading-relaxed text-ink-muted">
        Block <span className="font-mono">{blockId}</span> is not available for this
        document — it was indexed before block references, so this citation is
        page-level.
      </p>
    );
  }

  if (!data) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-xl border border-brand/25 bg-brand-soft px-3 py-2 text-[12px] text-brand-deep">
        <Spinner className="size-3" /> Locating cited block…
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2.5">
      <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-brand-deep">
        Cited block
        <span className="font-mono normal-case tracking-normal opacity-70">
          {data.block_id} · {data.block_type}
        </span>
      </p>
      {data.text && mode === "text" && (
        <p className="mt-1.5 border-l-2 border-brand/40 pl-2.5 font-serif text-[14px] leading-relaxed text-ink">
          {data.text}
        </p>
      )}
      {mode === "page" && (
        <p className="mt-1 text-[11px] text-brand-deep/80">
          Highlighted on the page below.
        </p>
      )}
    </div>
  );
}

function PageImage({
  docId,
  page,
  blockId,
}: {
  docId: string;
  page: number;
  blockId: string | null;
}) {
  const { data, loading, error } = useFetch<{ url: string }>(
    `/api/docs/${encodeURIComponent(docId)}/image?page=${page}`,
  );
  const { data: block } = useFetch<BlockResponse>(
    blockId
      ? `/api/docs/${encodeURIComponent(docId)}/block/${encodeURIComponent(blockId)}`
      : null,
  );

  if (error) {
    return (
      <p className="rounded-xl border border-line bg-paper p-3 text-[13px] text-ink-muted">
        Page renders are unavailable for this document. {error.message}
      </p>
    );
  }

  if (loading || !data?.url) {
    return <Skeleton className="h-[70vh] w-full" />;
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.url} alt={`Page ${page}`} className="block h-auto w-full" />
      {block && block.page === page && (
        <div
          className="pointer-events-none absolute rounded-[3px] border-2 border-brand bg-brand/15"
          style={{
            left: `${block.bbox[0] / 10}%`,
            top: `${block.bbox[1] / 10}%`,
            width: `${(block.bbox[2] - block.bbox[0]) / 10}%`,
            height: `${(block.bbox[3] - block.bbox[1]) / 10}%`,
          }}
        />
      )}
    </div>
  );
}

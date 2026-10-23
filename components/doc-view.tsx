"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import { formatDate, isPending } from "@/lib/format";
import type { PageIndexDocument, TreeNode, TreeResponse } from "@/lib/pageindex/types";
import { PageReader } from "@/components/page-reader";
import { TreeOutline } from "@/components/tree-outline";
import { Button, ErrorPanel, Skeleton, Spinner, StatusBadge, cn } from "@/components/ui-kit";

const isCompleted = (doc: PageIndexDocument) => doc.status === "completed";

/**
 * The document reader: tree index on the left, pages on the right, page image
 * (with block highlight) on demand. Chat lives in its own surface — the reader
 * hands you there with the document already in scope.
 */
export function DocView({ docId }: { docId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pageOverride, setPageOverride] = useState<number | null>(null);
  const [blockOverride, setBlockOverride] = useState<string | null | undefined>(undefined);
  const [showTree, setShowTree] = useState(true);

  const urlPage = Number.parseInt(searchParams.get("page") ?? "", 10);
  const page = pageOverride ?? (Number.isFinite(urlPage) && urlPage > 0 ? urlPage : 1);
  const blockId = blockOverride !== undefined ? blockOverride : searchParams.get("block");

  const metadata = useFetch<PageIndexDocument>(`/api/docs/${encodeURIComponent(docId)}`, {
    refreshMs: 5000,
    stopWhen: isCompleted,
  });
  const ready = metadata.data?.status === "completed";
  const tree = useFetch<TreeResponse>(
    ready ? `/api/docs/${encodeURIComponent(docId)}/tree` : null,
  );

  // Keep the address bar shareable: a citation link restores page + block.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (page > 1) url.searchParams.set("page", String(page));
    else url.searchParams.delete("page");
    if (blockId) url.searchParams.set("block", blockId);
    else url.searchParams.delete("block");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [page, blockId]);

  const goToPage = (next: number) => {
    setPageOverride(next);
    setBlockOverride(null);
  };

  const handleNode = (node: TreeNode) => {
    if (typeof node.page_index === "number") {
      setPageOverride(node.page_index);
      setBlockOverride(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/library"
            className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-ink-muted transition-colors hover:border-ink/25 hover:text-ink"
            aria-label="Back to documents"
          >
            ←
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-serif text-[17px] leading-tight text-ink">
                {metadata.data?.name ?? (metadata.loading ? "Loading…" : docId)}
              </h1>
              {metadata.data && <StatusBadge status={metadata.data.status} />}
            </div>
            <p className="truncate text-[11px] text-ink-muted">
              {metadata.data
                ? [
                    metadata.data.pageNum ? `${metadata.data.pageNum} pages` : null,
                    formatDate(metadata.data.createdAt),
                    metadata.data.description,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.push(`/chat?docs=${encodeURIComponent(docId)}`)}
          >
            Chat about this
          </Button>
          <Button
            size="sm"
            variant={showTree ? "secondary" : "ghost"}
            onClick={() => setShowTree((value) => !value)}
          >
            Outline
          </Button>
        </div>
      </header>

      {metadata.error && (
        <div className="p-4">
          <ErrorPanel error={metadata.error} onRetry={metadata.reload} />
        </div>
      )}

      {!metadata.error && !ready && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-brand-soft text-brand-deep">
              {isPending(metadata.data?.status) ? (
                <Spinner className="size-4" />
              ) : (
                <span aria-hidden>◍</span>
              )}
            </div>
            <p className="font-serif text-lg text-ink">
              {metadata.data?.status === "failed" ? "Indexing failed" : "Building the tree index"}
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {metadata.data?.status === "failed"
                ? "PageIndex could not index this document. Delete it and try another file."
                : "PageIndex is parsing, OCR-ing and building the hierarchical tree. This page updates itself when the document is ready."}
            </p>
            {metadata.data && (
              <div className="mt-3 flex justify-center">
                <StatusBadge status={metadata.data.status} />
              </div>
            )}
          </div>
        </div>
      )}

      {ready && (
        <div
          className={cn(
            "grid min-h-0 flex-1 grid-cols-1",
            showTree && "lg:grid-cols-[minmax(200px,270px)_minmax(0,1fr)]",
          )}
        >
          {showTree && (
            <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-line bg-surface/60 px-2 py-3 lg:flex">
              <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted">
                Tree index
              </p>
              {tree.loading && !tree.data ? (
                <div className="flex flex-col gap-2 px-2">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <Skeleton key={index} className="h-3.5 w-full" />
                  ))}
                </div>
              ) : tree.error ? (
                <p className="px-2 text-[12px] leading-relaxed text-red-800">{tree.error.message}</p>
              ) : (
                <TreeOutline nodes={tree.data?.result} activePage={page} onSelect={handleNode} />
              )}
            </aside>
          )}

          <main className="flex min-h-0 flex-col">
            <PageReader
              docId={docId}
              page={page}
              fallbackPageCount={metadata.data?.pageNum}
              blockId={blockId}
              onPage={goToPage}
              onClearBlock={() => setBlockOverride(null)}
            />
          </main>
        </div>
      )}
    </div>
  );
}

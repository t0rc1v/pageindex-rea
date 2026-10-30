"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import { formatDate, isPending } from "@/lib/format";
import type {
  Citation,
  PageIndexDocument,
  TreeNode,
  TreeResponse,
} from "@/lib/pageindex/types";
import { DocChatMenu } from "@/components/doc-chat/doc-chat-menu";
import { DocChatPanel } from "@/components/doc-chat/doc-chat-panel";
import { DocComposer } from "@/components/doc-chat/doc-composer";
import { useDocChat } from "@/components/doc-chat/use-doc-chat";
import { PageReader } from "@/components/page-reader";
import { TreeOutline } from "@/components/tree-outline";
import { Button, ErrorPanel, Skeleton, Spinner, StatusBadge, cn } from "@/components/ui-kit";
import { useMediaQuery } from "@/hooks/use-media";
import { usePanelWidth } from "@/hooks/use-panel-width";

const isCompleted = (doc: PageIndexDocument) => doc.status === "completed";

/**
 * The document reader: tree index on the left, pages on the right, page image
 * (with block highlight) on demand.
 *
 * Chat is the same conversation surface `/chat` uses, inverted: here the document
 * is the page and the conversation is the panel beside it. The composer under the
 * page starts a new chat about this document; the panel's composer continues the
 * one it is showing. Citations resolve into the reader, never into a second
 * panel.
 */
export function DocView({ docId }: { docId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pageOverride, setPageOverride] = useState<number | null>(null);
  const [blockOverride, setBlockOverride] = useState<string | null | undefined>(undefined);

  /**
   * The reader's own preference, not the effective state.
   *
   * Below the three-column breakpoint the panel needs the width, so the tree
   * steps aside for as long as it is open and comes back on close — derived on
   * render, so there is nothing to save and nothing to restore.
   */
  const [showTreePref, setShowTreePref] = useState(true);

  const urlPage = Number.parseInt(searchParams.get("page") ?? "", 10);
  const page = pageOverride ?? (Number.isFinite(urlPage) && urlPage > 0 ? urlPage : 1);
  const blockId = blockOverride !== undefined ? blockOverride : searchParams.get("block");

  const metadata = useFetch<PageIndexDocument>(`/api/docs/${encodeURIComponent(docId)}`, {
    refreshMs: 5000,
    stopWhen: isCompleted,
  });
  const ready = metadata.data?.status === "completed";
  const docName = metadata.data?.name ?? docId;
  const tree = useFetch<TreeResponse>(
    ready ? `/api/docs/${encodeURIComponent(docId)}/tree` : null,
  );

  const {
    chats: docChats,
    ready: docChatsReady,
    activeId: activeChatId,
    open: chatOpen,
    pending: pendingChat,
    freshId: freshChatId,
    startChat,
    newChat,
    openChat,
    close: closeChat,
    clearPending,
    rename: renameDocChat,
    remove: removeDocChat,
  } = useDocChat(docId);

  // Wide enough for tree + page + panel to coexist. Below this the panel covers
  // the page instead, so something has to give — the tree goes.
  const docked = useMediaQuery("(min-width: 1280px)");

  // Below 1280 px the panel covers the page instead of docking, so its width
  // only matters when docked. Past 480 px the tree is what gives way; the
  // derived flag means closing the panel brings it straight back.
  const chatPanel = usePanelWidth({
    storageKey: "pageindex-reader/doc-chat-width",
    min: 380,
    max: 560,
    initial: 420,
  });
  const treeMakingWay = chatOpen && (!docked || chatPanel.width > 480);
  const showTree = showTreePref && !treeMakingWay;

  // Keep the address bar shareable: a citation link restores page + block.
  // `useDocChat` writes the `chat` parameter on the same URL.
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

  /**
   * Where a citation in the panel lands.
   *
   * In this document it turns the page under the panel. Cited from another
   * document, it opens that document's reader at the right page — same tab, so
   * the conversation stays one back-button away. On narrow screens the panel
   * steps aside, because it would otherwise cover the page it just opened.
   */
  const openCitation = useCallback(
    (citation: Citation) => {
      if (citation.docId && citation.docId !== docId) {
        const query = new URLSearchParams({ page: String(citation.page) });
        if (citation.blockId) query.set("block", citation.blockId);
        router.push(`/doc/${encodeURIComponent(citation.docId)}?${query.toString()}`);
        return;
      }

      setPageOverride(citation.page);
      setBlockOverride(citation.blockId ?? null);
      if (!docked) closeChat();
    },
    [docId, docked, router, closeChat],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="relative z-30 flex items-center justify-between gap-3 border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/library"
              className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-ink-muted transition-colors hover:border-ink/25 hover:text-ink"
              aria-label="Back to documents"
            >
              ←
            </Link>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="min-w-0 truncate font-serif text-[17px] leading-tight text-ink">
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

          <div className="flex shrink-0 items-center gap-1.5">
            <DocChatMenu
              chats={docChats}
              ready={docChatsReady}
              activeId={activeChatId}
              onOpen={openChat}
              onNew={newChat}
              onRename={renameDocChat}
              onDelete={removeDocChat}
            />
            <Button
              size="sm"
              variant={showTree ? "secondary" : "ghost"}
              disabled={treeMakingWay}
              title={treeMakingWay ? "The tree steps aside while the chat panel is open" : undefined}
              onClick={() => setShowTreePref((value) => !value)}
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
                  <p className="px-2 text-[12px] leading-relaxed text-red-800">
                    {tree.error.message}
                  </p>
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
              <DocComposer onSend={startChat} />
            </main>
          </div>
        )}
      </div>

      {chatOpen && activeChatId && (
        <DocChatPanel
          key={activeChatId}
          docId={docId}
          docName={docName}
          chatId={activeChatId}
          page={page}
          pending={pendingChat}
          fresh={freshChatId === activeChatId}
          resize={chatPanel}
          onPendingSent={clearPending}
          chats={docChats}
          activeId={activeChatId}
          onSelect={openChat}
          onNew={newChat}
          onRename={renameDocChat}
          onDelete={removeDocChat}
          onClose={closeChat}
          onOpenCitation={openCitation}
        />
      )}
    </div>
  );
}

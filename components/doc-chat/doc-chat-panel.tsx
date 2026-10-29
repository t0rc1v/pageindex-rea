"use client";

import { ArrowUp, MessageSquare, Square, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import type { StoredChat } from "@/lib/chat-types";
import type { Citation } from "@/lib/pageindex/types";
import { ChatTranscript } from "@/components/chat/chat-transcript";
import { useChat } from "@/components/chat/use-chat";
import { useComposer } from "@/components/chat/use-composer";
import { Skeleton, cn } from "@/components/ui-kit";
import { DocChatMenu } from "./doc-chat-menu";
import type { PendingMessage } from "./use-doc-chat";

const SUGGESTIONS = [
  "Summarize this document.",
  "What are the key findings?",
  "Walk me through its structure.",
];

/**
 * One document conversation, beside the page.
 *
 * The mirror image of `/chat`: there the conversation is the page and the
 * document is the panel; here the document stays put and the conversation
 * overlays it. Citations therefore do not open anything here — they are handed
 * to `onOpenCitation`, which turns the reader's page.
 *
 * Docked on a wide screen, a right-hand sheet over the page on a tablet, and a
 * bottom sheet on a phone, where the document is not visible behind it anyway.
 *
 * The panel is keyed by chat id by its caller: `useChat` reads its chat once, on
 * mount, which is also what makes switching conversations a clean load.
 */
export function DocChatPanel({
  docId,
  docName,
  chatId,
  pending,
  onPendingSent,
  chats,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onClose,
  onOpenCitation,
}: {
  docId: string;
  docName: string;
  chatId: string;
  pending: PendingMessage | null;
  onPendingSent: () => void;
  chats: StoredChat[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onOpenCitation: (citation: Citation) => void;
}) {
  // Stable identity: `useChat` refetches when `initialDocs` changes, and a fresh
  // literal every render would be an infinite load loop.
  const initialDocs = useMemo(() => [{ id: docId, name: docName }], [docId, docName]);
  const chat = useChat({ chatId, initialDocs, originDocId: docId });

  const {
    value: draft,
    attach,
    onChange,
    onKeyDown,
    submit: submitDraft,
  } = useComposer({
    onSubmit: (text) => chat.send(text),
    disabled: chat.busy || chat.loading,
  });
  const fired = useRef<string | null>(null);

  /**
   * A question typed into the document's composer. It has to wait for this panel
   * to finish opening the chat, or `useChat` would still be hydrating and drop
   * the message.
   */
  useEffect(() => {
    if (!pending || pending.id !== chatId || chat.loading) return;

    const key = `${pending.id}:${pending.text}`;
    if (fired.current === key) return;
    fired.current = key;

    chat.send(pending.text);
    onPendingSent();
  }, [pending, chatId, chat.loading, chat, onPendingSent]);

  const title = chats.find((item) => item.id === chatId)?.title ?? "New chat";

  return (
    <>
      {/* Phones only: the sheet is modal, a tablet keeps the page visible. */}
      <div
        className="fixed inset-0 z-40 bg-ink/50 backdrop-blur-sm md:hidden"
        aria-hidden
        onClick={onClose}
      />

      <aside
        aria-label="Document chat"
        className={cn(
          "z-50 flex min-h-0 flex-col bg-surface",
          "fixed inset-x-0 bottom-0 top-10 rounded-t-2xl border border-line shadow-2xl",
          "md:inset-x-auto md:left-auto md:right-0 md:top-0 md:w-[420px] md:rounded-none md:border-0 md:border-l",
          "xl:static xl:z-auto xl:h-full xl:w-[420px] xl:shrink-0 xl:border-l xl:shadow-none",
        )}
      >
        <div className="flex shrink-0 justify-center pt-2 md:hidden">
          <span className="h-1 w-9 rounded-full bg-line" aria-hidden />
        </div>

        <header className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <p
              className="truncate px-1 text-[12.5px] font-medium text-ink"
              title={title}
              onDoubleClick={() => {
                const next = window.prompt("Rename chat", title);
                if (next?.trim()) onRename(chatId, next);
              }}
            >
              {title}
            </p>
            <p className="truncate px-1 text-[10px] text-ink-muted">{docName}</p>
          </div>

          <DocChatMenu
            chats={chats}
            ready
            activeId={activeId}
            onOpen={onSelect}
            onNew={onNew}
            onRename={onRename}
            onDelete={onDelete}
            align="end"
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="cursor-pointer rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper hover:text-ink"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {chat.loading ? (
            <PanelSkeleton />
          ) : chat.turns.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <MessageSquare className="size-6 text-ink-muted" aria-hidden />
              <p className="mt-3 font-serif text-[17px] text-ink">Ask about this document</p>
              <p className="mt-1 max-w-[16rem] text-[12px] leading-relaxed text-ink-muted">
                Answers cite pages; a citation turns the reader behind this panel.
              </p>
              <div className="mt-4 flex w-full max-w-[20rem] flex-col gap-1.5">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => chat.send(suggestion)}
                    className="cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-left text-[12px] leading-snug text-ink transition-colors hover:border-ink/25 hover:bg-paper"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl px-3.5 py-5">
              <ChatTranscript chat={chat} onOpenCitation={onOpenCitation} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-line bg-paper/85 px-2.5 py-2 backdrop-blur pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="flex items-end gap-1.5 rounded-[14px] border border-line bg-surface px-2 py-1.5 transition-colors focus-within:border-ink/30">
            <textarea
              ref={attach}
              value={draft}
              onChange={onChange}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder={chat.busy ? "Answering…" : "Ask a follow-up…"}
              aria-label="Ask a follow-up"
              className="max-h-24 min-h-[32px] min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-muted/70"
            />

            {chat.busy ? (
              <button
                type="button"
                onClick={chat.stop}
                aria-label="Stop generating"
                className="mb-0.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper"
              >
                <Square className="size-3 fill-current" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={submitDraft}
                disabled={!draft.trim() || chat.loading}
                aria-label="Send message"
                className="mb-0.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-paper transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-3.5 py-5" aria-busy="true" aria-label="Opening chat">
      <Skeleton className="ml-auto h-8 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-11/12" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

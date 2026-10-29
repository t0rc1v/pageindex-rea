"use client";

import { ArrowDown, Paperclip, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { useFetch } from "@/lib/client/hooks";
import type { Citation } from "@/lib/pageindex/types";
import type { DocumentListResponse } from "@/lib/pageindex/types";
import { Onboarding } from "@/components/onboarding";
import { Skeleton } from "@/components/ui-kit";
import { ChatTranscript } from "./chat-transcript";
import { DocumentPanel, type OpenDoc } from "./document-panel";
import { DocPicker } from "./doc-picker";
import { useComposer } from "./use-composer";
import { useDocIds } from "./use-doc-ids";
import { useChat, type ChatDoc } from "./use-chat";

const SUGGESTIONS = [
  "Summarize the key findings and cite where they come from.",
  "Compare the main arguments across the documents in scope.",
  "Walk me through the structure before I start reading.",
];

export function ChatWorkspace({ chatId, initialDocs }: { chatId?: string; initialDocs?: ChatDoc[] }) {
  const chat = useChat({ chatId, initialDocs });

  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  // One cheap probe decides between onboarding and the prompt suggestions.
  const library = useFetch<DocumentListResponse>("/api/docs?limit=1", { staleTime: 60_000 });

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !atBottom) return;
    element.scrollTop = element.scrollHeight;
  }, [chat.turns, atBottom]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value) return;
    chat.send(value);
    setAtBottom(true);
  };

  const {
    value: draft,
    attach,
    onChange,
    onKeyDown,
    submit: submitDraft,
    focus,
  } = useComposer({ onSubmit: send, disabled: chat.loading, maxHeight: 176 });

  // ⌘/Ctrl+K jumps to the composer wherever focus is.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 160);
  }, []);

  const scopeLabel =
    chat.docs.length === 0
      ? "Select Documents"
      : chat.docs.length === 1
        ? chat.docs[0]!.name
        : `${chat.docs.length} documents`;

  const { withDocId } = useDocIds(chat);

  const openCitation = useCallback(
    (unresolved: Citation) => {
      const citation = withDocId(unresolved);
      if (!citation.docId) return;
      setOpenDocs((docs) => {
        const existing = docs.find((doc) => doc.docId === citation.docId);
        if (existing) {
          return docs.map((doc) =>
            doc.docId === citation.docId
              ? { ...doc, page: citation.page, blockId: citation.blockId, bbox: citation.bbox }
              : doc,
          );
        }
        return [
          ...docs,
          {
            docId: citation.docId!,
            name: citation.document,
            page: citation.page,
            blockId: citation.blockId,
            bbox: citation.bbox,
          },
        ];
      });
      setActiveDocId(citation.docId);
    },
    [withDocId],
  );

  const addPageToChat = useCallback(
    async (doc: OpenDoc) => {
      const existing = chat.context.some(
        (item) => item.docId === doc.docId && item.page === doc.page,
      );
      if (existing) {
        toast.info(`Page ${doc.page} is already attached`);
        return;
      }
      try {
        const response = await fetch(
          `/api/docs/${encodeURIComponent(doc.docId)}/pages?from=${doc.page}&to=${doc.page}`,
        );
        if (!response.ok) throw new Error(`Page fetch failed (${response.status})`);
        const payload = (await response.json()) as {
          pages: Array<{ page_index: number; markdown: string }>;
        };
        const text = payload.pages?.[0]?.markdown ?? "";
        if (!text.trim()) throw new Error("That page has no text to attach");
        chat.addContext({ docId: doc.docId, docName: doc.name, page: doc.page, text });
        toast.success(`Page ${doc.page} attached to your next question`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not attach the page");
      }
    },
    [chat],
  );

  const scrollToBottom = () => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {chat.loading ? (
              <TranscriptSkeleton />
            ) : chat.turns.length === 0 ? (
              library.data && library.data.total === 0 ? (
                <Onboarding onUploaded={() => library.reload()} />
              ) : (
                <div className="flex flex-col gap-5 pt-4">
                  <div>
                    <h1 className="font-serif text-[26px] leading-snug text-ink">Ask your documents</h1>
                    <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-ink-muted">
                      PageIndex reads the tree it built for each document, opens the pages it needs,
                      and answers with citations you can open beside the conversation.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => send(suggestion)}
                        className="cursor-pointer rounded-xl border border-line bg-surface px-3 py-2 text-left text-[13px] leading-snug text-ink transition-colors hover:border-ink/25 hover:bg-paper"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )
            ) : (
              <ChatTranscript chat={chat} onOpenCitation={openCitation} />
            )}
          </div>
        </div>

        <div className="relative border-t border-line bg-paper/85 px-3 py-2.5 backdrop-blur sm:px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          {!atBottom && (
            <button
              type="button"
              onClick={scrollToBottom}
              aria-label="Scroll to latest"
              className="absolute -top-11 left-1/2 grid size-8 -translate-x-1/2 cursor-pointer place-items-center rounded-full border border-line bg-surface text-ink-muted shadow-md transition-colors hover:text-ink"
            >
              <ArrowDown className="size-4" aria-hidden />
            </button>
          )}

          <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-[16px] border border-line bg-surface transition-colors focus-within:border-ink/30">
              {chat.context.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
                  {chat.context.map((item) => (
                    <span
                      key={`${item.docId}-${item.page}`}
                      className="flex max-w-full items-center gap-1 rounded-md border border-line bg-paper px-1.5 py-0.5 text-[10.5px] text-ink-muted"
                    >
                      <Paperclip className="size-2.5 shrink-0" aria-hidden />
                      <span className="truncate">{item.docName}</span>
                      <span className="shrink-0 font-mono">p.{item.page}</span>
                      <button
                        type="button"
                        aria-label={`Remove page ${item.page} from context`}
                        onClick={() => chat.removeContext(item.docId, item.page)}
                        className="cursor-pointer rounded p-0.5 hover:text-ink"
                      >
                        <X className="size-2.5" aria-hidden />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <textarea
                ref={attach}
                value={draft}
                onChange={onChange}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder={
                  chat.loading
                    ? "Opening conversation…"
                    : chat.busy
                      ? "AI is thinking…"
                      : "Ask a question…"
                }
                className="block max-h-44 min-h-[95px] w-full resize-none bg-transparent px-3.5 pt-3 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-muted/70"
              />
              <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
                <div className="relative flex min-w-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((value) => !value)}
                    aria-expanded={pickerOpen}
                    className="flex min-w-0 max-w-[240px] cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-[11.5px] text-ink-muted transition-colors hover:border-ink/25 hover:text-ink"
                  >
                    <Plus className="size-3.5 shrink-0" aria-hidden />
                    <span className="truncate">{scopeLabel}</span>
                  </button>
                  {chat.docs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => chat.setDocs([])}
                      aria-label="Clear document scope"
                      className="cursor-pointer rounded p-1 text-ink-muted hover:bg-paper hover:text-ink"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  )}
                  {pickerOpen && (
                    <DocPicker
                      selected={chat.docs}
                      onApply={chat.setDocs}
                      onClose={() => setPickerOpen(false)}
                    />
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {chat.busy ? (
                    <button
                      type="button"
                      onClick={chat.stop}
                      aria-label="Stop generating"
                      className="grid size-9 cursor-pointer place-items-center rounded-full border border-line text-ink transition-colors hover:bg-paper"
                    >
                      <span className="size-2.5 rounded-sm bg-ink" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={submitDraft}
                      disabled={!draft.trim() || chat.loading}
                      aria-label="Send message"
                      className="grid size-9 cursor-pointer place-items-center rounded-full bg-ink text-paper transition-opacity disabled:opacity-30"
                    >
                      <ArrowDown className="size-4 rotate-180" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-1 hidden text-center text-[10px] text-ink-muted/70 sm:block">
              Enter to send · Shift+Enter for a new line · ⌘K to jump here
            </p>
          </div>
        </div>
      </div>

      {openDocs.length > 0 && (
        <DocumentPanel
          docs={openDocs}
          activeId={activeDocId}
          onActivate={setActiveDocId}
          onPage={(docId, page) =>
            setOpenDocs((docs) => docs.map((doc) => (doc.docId === docId ? { ...doc, page } : doc)))
          }
          onClose={(docId) => {
            setOpenDocs((docs) => {
              const next = docs.filter((doc) => doc.docId !== docId);
              if (activeDocId === docId) setActiveDocId(next[0]?.docId ?? null);
              return next;
            });
          }}
          onCloseAll={() => {
            setOpenDocs([]);
            setActiveDocId(null);
          }}
          onAddPage={addPageToChat}
        />
      )}
    </div>
  );
}

/**
 * A stored conversation arrives over the network now, so `/chat/[id]` shows the
 * shape of an answer (question line, paragraph, sources) while it loads rather
 * than flashing the "ask your documents" empty state and then replacing it.
 */
function TranscriptSkeleton() {
  return (
    <div className="flex flex-col gap-6 pt-2" aria-busy="true" aria-label="Opening conversation">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-11/12" />
        <Skeleton className="h-3 w-9/12" />
        <Skeleton className="mt-2 h-3 w-32" />
      </div>
    </div>
  );
}

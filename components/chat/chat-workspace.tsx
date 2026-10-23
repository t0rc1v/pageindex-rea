"use client";

import { ArrowDown, ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { citationKey, parseCitations, splitStreamingTail } from "@/lib/citations";
import type { Citation } from "@/lib/pageindex/types";
import { Markdown } from "@/components/markdown";
import { cn } from "@/components/ui-kit";
import { DocumentPanel, type OpenDoc } from "./document-panel";
import { CitationCard, type CitationAnchor } from "./citation-card";
import { DocPicker } from "./doc-picker";
import { MessageActions } from "./message-actions";
import { Sources } from "./sources";
import { ToolStep } from "./tool-step";
import { turnDuration, turnText, useChat, type ChatDoc, type ChatTurn } from "./use-chat";

const SUGGESTIONS = [
  "Summarize the key findings and cite where they come from.",
  "Compare the main arguments across the documents in scope.",
  "Walk me through the structure before I start reading.",
];

/** Merge the citations frame onto the inline tags, keeping the text's order. */
function mergeCitations(answer: string, fromServer: Citation[]): Citation[] {
  const byKey = new Map(fromServer.map((citation) => [citationKey(citation), citation]));
  const merged = parseCitations(answer).map((citation) => {
    const match = byKey.get(citationKey(citation));
    return match ? { ...citation, ...match } : citation;
  });
  if (merged.length > 0) {
    for (const citation of fromServer) {
      if (!merged.some((item) => citationKey(item) === citationKey(citation))) merged.push(citation);
    }
    return merged;
  }
  return fromServer;
}

function normalized(value: string): string {
  return value
    .toLowerCase()
    .replace(/\.(pdf|docx?|pptx?|xlsx?|csv|md|txt)$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function ChatWorkspace({ chatId, initialDocs }: { chatId?: string; initialDocs?: ChatDoc[] }) {
  const chat = useChat({ chatId, initialDocs });

  const [preview, setPreview] = useState<CitationAnchor | null>(null);
  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [input, setInput] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const answerNodes = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !atBottom) return;
    element.scrollTop = element.scrollHeight;
  }, [chat.turns, atBottom]);

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

  const resolveDocId = useCallback(
    (name: string | undefined): string | undefined => {
      if (!name) return undefined;
      const pool = [...chat.library, ...chat.docs];
      const exact = pool.find((doc) => doc.name === name);
      if (exact) return exact.id;
      const needle = normalized(name);
      return pool.find((doc) => normalized(doc.name) === needle)?.id;
    },
    [chat.docs, chat.library],
  );

  const openCitation = useCallback((citation: Citation) => {
    setPreview(null);
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
  }, []);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    chat.send(value);
    setInput("");
    setAtBottom(true);
  };

  const scrollToBottom = () => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
  };

  const lastTurnId = chat.turns[chat.turns.length - 1]?.id;
  const question = useMemo(() => {
    const [first] = chat.turns;
    return first ? turnText(first).answer : undefined;
  }, [chat.turns]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {chat.turns.length === 0 ? (
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
                      onClick={() => submit(suggestion)}
                      className="cursor-pointer rounded-xl border border-line bg-surface px-3 py-2 text-left text-[13px] leading-snug text-ink transition-colors hover:border-ink/25 hover:bg-paper"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                {chat.turns.map((turn) => (
                  <Turn
                    key={turn.id}
                    turn={turn}
                    isLast={turn.id === lastTurnId}
                    busy={chat.busy}
                    resolveDocId={resolveDocId}
                    answerRef={(node) => {
                      if (node) answerNodes.current.set(turn.id, node);
                      else answerNodes.current.delete(turn.id);
                    }}
                    getNode={() => answerNodes.current.get(turn.id) ?? null}
                    onPreview={(citation, rect) => setPreview({ citation, rect })}
                    onOpenPage={openCitation}
                    onRegenerate={chat.regenerate}
                    onEdit={() => setEditingId(turn.id)}
                    editing={editingId === turn.id}
                    onCancelEdit={() => setEditingId(null)}
                    onSaveEdit={(text) => {
                      setEditingId(null);
                      chat.editAndResend(turn.id, text);
                    }}
                    question={question}
                  />
                ))}
              </div>
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
            <div className="rounded-xl border border-line bg-surface transition-colors focus-within:border-ink/30">
              <textarea
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  const element = event.target;
                  element.style.height = "auto";
                  element.style.height = `${Math.min(element.scrollHeight, 176)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(input);
                  }
                }}
                rows={1}
                placeholder={chat.busy ? "AI is thinking…" : "Ask a question…"}
                className="block max-h-44 min-h-[52px] w-full resize-none bg-transparent px-3.5 pt-3 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-muted/70"
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
                      onClick={() => submit(input)}
                      disabled={!input.trim()}
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
              Enter to send · Shift+Enter for a new line
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
        />
      )}

      {preview && (
        <CitationCard anchor={preview} onClose={() => setPreview(null)} onOpenPage={openCitation} />
      )}
    </div>
  );
}

function Turn({
  turn,
  isLast,
  busy,
  resolveDocId,
  answerRef,
  getNode,
  onPreview,
  onOpenPage,
  onRegenerate,
  onEdit,
  editing,
  onCancelEdit,
  onSaveEdit,
  question,
}: {
  turn: ChatTurn;
  isLast: boolean;
  busy: boolean;
  resolveDocId: (name: string | undefined) => string | undefined;
  answerRef: (node: HTMLElement | null) => void;
  getNode: () => HTMLElement | null;
  onPreview: (citation: Citation, rect: CitationAnchor["rect"]) => void;
  onOpenPage: (citation: Citation) => void;
  onRegenerate: () => void;
  onEdit: (text: string) => void;
  editing: boolean;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  question?: string;
}) {
  const { answer, process } = turnText(turn);
  // `pending` is the half-received citation tag splitStreamingTail holds back;
  // it is rendered on the next token, so we only paint `stable`.
  const stable = turn.streaming ? splitStreamingTail(answer).stable : answer;
  const citations = useMemo(() => mergeCitations(answer, turn.citations), [answer, turn.citations]);
  const { thought } = turnDuration(turn);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  if (turn.role === "user") {
    const text = turnText(turn).answer;
    if (editing) {
      return (
        <div className="group/message flex flex-col items-end gap-1">
          <InlineEditor initial={text} onCancel={onCancelEdit} onSave={onSaveEdit} />
        </div>
      );
    }
    return (
      <div className="group/message flex flex-col items-end gap-1">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13.5px] leading-relaxed text-paper">
          {text}
        </p>
        <MessageActions role="user" text={text} onEdit={onEdit} />
      </div>
    );
  }

  const runningTool = turn.tools.some((tool) => tool.status === "start");

  return (
    <div className="group/message flex flex-col gap-1.5">
      {(process || (turn.streaming && !answer)) && (
        <div>
          <button
            type="button"
            onClick={() => setReasoningOpen((value) => !value)}
            aria-expanded={reasoningOpen}
            className="flex cursor-pointer items-center gap-1.5 py-0.5 text-[12.5px] text-ink-muted transition-colors hover:text-ink"
          >
            <Sparkles className="size-3.5" aria-hidden />
            <span>
              {process
                ? `Thought for ${Math.max(1, Math.round(thought ?? 1))}s`
                : "Thinking…"}
            </span>
            {process && (
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  reasoningOpen && "rotate-180",
                )}
                aria-hidden
              />
            )}
          </button>
          {reasoningOpen && process && (
            <p className="mt-1 whitespace-pre-wrap border-l border-line pl-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              {process}
            </p>
          )}
        </div>
      )}

      {turn.tools.length > 0 && (
        <ul className="flex flex-col">
          {turn.tools.map((tool, index) => (
            <ToolStep
              key={tool.id ?? `${tool.name}-${index}`}
              tool={tool}
              running={tool.status === "start"}
              docId={resolveDocId(
                typeof tool.args === "object" && tool.args
                  ? ((tool.args as Record<string, unknown>).doc_name as string | undefined) ??
                      ((tool.args as Record<string, unknown>).document as string | undefined)
                  : undefined,
              )}
            />
          ))}
        </ul>
      )}

      {stable && (
        <div ref={answerRef} className="group/answer">
          {/* `pending` is the half-received citation tag splitStreamingTail holds
              back; rendering it would flash raw `<doc=...>` markup. */}
          <Markdown compact onCite={onPreview} citations={turn.citations}>
            {stable}
          </Markdown>
        </div>
      )}

      {turn.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-red-900">
          {turn.error}
        </p>
      )}

      {!turn.streaming && (
        <div className="flex flex-col gap-1">
          {!runningTool && stable && (
            <MessageActions
              role="assistant"
              text={answer}
              citations={citations}
              question={question}
              at={turn.timings?.finishedAt}
              getNode={getNode}
              onRegenerate={isLast ? onRegenerate : undefined}
              canRegenerate={!busy}
            />
          )}
          <Sources citations={citations} onPreview={onPreview} onOpenPage={onOpenPage} />
        </div>
      )}
    </div>
  );
}

function InlineEditor({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (next: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-full rounded-xl border border-line bg-surface p-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        autoFocus
        className="block max-h-48 w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-ink outline-none"
      />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md px-2 py-1 text-[11.5px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={!value.trim()}
          className="cursor-pointer rounded-md bg-ink px-2.5 py-1 text-[11.5px] text-paper disabled:opacity-40"
        >
          Save &amp; resend
        </button>
      </div>
    </div>
  );
}

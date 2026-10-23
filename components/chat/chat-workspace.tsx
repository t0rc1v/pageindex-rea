"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { citationKey, parseCitations, splitStreamingTail } from "@/lib/citations";
import type { Citation } from "@/lib/pageindex/types";
import { Markdown } from "@/components/markdown";
import { Button, Spinner, cn } from "@/components/ui-kit";
import { ArtifactPanel } from "./artifact-panel";
import { CitationCard, type CitationAnchor } from "./citation-card";
import { DocScopeDialog } from "./doc-scope";
import { turnText, useChat, type ChatDoc, type ChatTurn } from "./use-chat";

const SUGGESTIONS = [
  "Summarize the key findings and cite where they come from.",
  "Compare the main arguments across the documents in scope.",
  "Walk me through the structure before I start reading.",
];

const TOOL_LABELS: Record<string, string> = {
  find_relevant_documents: "Searched the library",
  browse_documents: "Browsed the library",
  get_document_structure: "Read the outline",
  get_page_content: "Read pages",
  get_document_image: "Fetched a figure",
  get_document: "Opened the document",
  search_documents: "Searched documents",
  get_folder_structure: "Read the folder tree",
  find_relevant_document: "Searched the library",
};

function toolLine(name: string, args: unknown): string {
  const label = TOOL_LABELS[name] ?? name.replace(/[_-]+/g, " ");
  const record = (args ?? {}) as Record<string, unknown>;
  if (name === "get_page_content" && typeof record.pages === "string") {
    return `${label} ${record.pages}`;
  }
  if (typeof record.query === "string") return `${label}: “${record.query}”`;
  return label;
}

const keyOf = citationKey;

/**
 * Merge the citations frame (bbox, block id, block type, doc id) onto the tags
 * in the answer text, keeping the text's order so numbers match the chips.
 */
function mergeCitations(answer: string, fromServer: Citation[]): Citation[] {
  const byKey = new Map(fromServer.map((citation) => [keyOf(citation), citation]));
  const fromText = parseCitations(answer);
  const merged = fromText.map((citation) => {
    const match = byKey.get(keyOf(citation));
    return match ? { ...match, ...citation, ...match } : citation;
  });
  if (merged.length > 0) {
    // A bbox may arrive only in the frame; keep any extra citations too.
    for (const citation of fromServer) {
      if (!merged.some((item) => keyOf(item) === keyOf(citation))) merged.push(citation);
    }
    return merged;
  }
  return fromServer;
}

export function ChatWorkspace({
  chatId,
  initialDocs,
}: {
  chatId?: string;
  initialDocs?: ChatDoc[];
}) {
  const router = useRouter();
  const chat = useChat({ chatId, initialDocs });
  const [preview, setPreview] = useState<CitationAnchor | null>(null);
  const [artifact, setArtifact] = useState<Citation | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const nearBottom =
      element.scrollHeight - element.scrollTop - element.clientHeight < 200;
    if (nearBottom) element.scrollTop = element.scrollHeight;
  }, [chat.turns]);

  const scopeLabel =
    chat.docs.length === 0
      ? "All documents"
      : chat.docs.length === 1
        ? chat.docs[0]!.name
        : `${chat.docs.length} documents`;

  const openPreview = useCallback(
    (citation: Citation, rect: CitationAnchor["rect"]) => setPreview({ citation, rect }),
    [],
  );

  const openPage = useCallback((citation: Citation) => {
    setPreview(null);
    if (citation.docId) setArtifact(citation);
  }, []);

  const submit = (text: string) => {
    const value = text.trim();
    if (!value) return;
    chat.send(value);
    setInput("");
  };

  const newChat = () => {
    chat.reset();
    setArtifact(null);
    setPreview(null);
    router.push("/chat");
  };

  const visibleMessages = useMemo(() => chat.turns, [chat.turns]);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/70 px-3 py-2 backdrop-blur sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setScopeOpen(true)}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] text-ink transition-colors hover:border-ink/25"
            >
              <span className="text-ink-muted">Scope</span>
              <span className="max-w-[220px] truncate">{scopeLabel}</span>
              <span aria-hidden className="text-ink-muted">
                ▾
              </span>
            </button>
            {chat.docs.length > 0 && (
              <button
                type="button"
                onClick={() => chat.setDocs([])}
                className="cursor-pointer text-[11px] text-ink-muted underline decoration-line underline-offset-2 hover:text-ink"
              >
                clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {chat.turns.length > 0 && (
              <Button size="sm" variant="secondary" onClick={newChat}>
                New chat
              </Button>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {visibleMessages.length === 0 ? (
              <div className="flex flex-col gap-5 pt-6">
                <div>
                  <h1 className="font-serif text-2xl leading-snug text-ink">
                    Ask your documents
                  </h1>
                  <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-muted">
                    PageIndex reads the tree it built for each document, opens the
                    pages it needs, and answers with numbered citations. Open a
                    citation to see the page and the exact block.
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
              <div className="flex flex-col gap-6">
                {visibleMessages.map((turn) =>
                  turn.role === "user" ? (
                    <div key={turn.id} className="flex justify-end">
                      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-[13px] leading-relaxed text-paper">
                        {turnText(turn).answer}
                      </p>
                    </div>
                  ) : (
                    <AssistantMessage
                      key={turn.id}
                      turn={turn}
                      onPreview={openPreview}
                      onOpenPage={openPage}
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-line bg-paper/80 px-3 py-2.5 backdrop-blur sm:px-4 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto w-full max-w-3xl">
            <div className="rounded-xl border border-line bg-surface focus-within:border-ink/30">
              <textarea
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  const element = event.target;
                  element.style.height = "auto";
                  element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit(input);
                  }
                }}
                rows={1}
                placeholder={
                  chat.docs.length > 0
                    ? `Ask about ${scopeLabel}…`
                    : "Ask across your library…"
                }
                className="block max-h-40 w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-muted/70"
              />
              <div className="flex items-center justify-between px-2 pb-2">
                <span className="hidden text-[10px] text-ink-muted/70 sm:block">
                  Enter to send · Shift+Enter for a new line
                </span>
                <div className="flex items-center gap-1.5">
                  {chat.busy ? (
                    <Button size="sm" variant="secondary" onClick={chat.stop}>
                      Stop
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => submit(input)}
                      disabled={!input.trim()}
                    >
                      Send
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {artifact && (
        <ArtifactPanel
          citation={artifact}
          onClose={() => setArtifact(null)}
          className="fixed inset-0 z-40 lg:static lg:z-auto lg:w-[430px] lg:border-l"
        />
      )}

      {preview && (
        <CitationCard
          anchor={preview}
          onClose={() => setPreview(null)}
          onOpenPage={openPage}
        />
      )}

      {scopeOpen && (
        <DocScopeDialog
          selected={chat.docs}
          onApply={chat.setDocs}
          onClose={() => setScopeOpen(false)}
        />
      )}
    </div>
  );
}

function AssistantMessage({
  turn,
  onPreview,
  onOpenPage,
}: {
  turn: ChatTurn;
  onPreview: (citation: Citation, rect: CitationAnchor["rect"]) => void;
  onOpenPage: (citation: Citation) => void;
}) {
  const { answer } = turnText(turn);
  const { stable, pending } = turn.streaming
    ? splitStreamingTail(answer)
    : { stable: answer, pending: "" };
  const citations = useMemo(
    () => mergeCitations(answer, turn.citations),
    [answer, turn.citations],
  );
  const openTool = turn.tools.find((tool) => tool.status === "start");

  return (
    <div className="flex flex-col gap-2">
      {turn.tools.length > 0 && (
        <ul className="flex flex-col gap-1">
          {turn.tools.map((tool, index) => (
            <li key={`${tool.name}-${index}`} className="flex items-center gap-2 text-[11px] text-ink-muted">
              {tool.status === "start" ? (
                <Spinner className="size-2.5 text-ink-muted" />
              ) : (
                <span aria-hidden className="text-emerald-600">
                  ✓
                </span>
              )}
              <span className={tool.status === "start" ? "text-ink" : undefined}>
                {toolLine(tool.name, tool.args)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {(stable || pending) && (
        <Markdown compact onCite={onPreview} citations={turn.citations}>
          {stable + pending}
        </Markdown>
      )}

      {turn.streaming && !answer && !openTool && (
        <div className="flex items-center gap-2 text-[12px] text-ink-muted">
          <Spinner className="size-3 text-ink-muted" /> Thinking…
        </div>
      )}

      {turn.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-red-900">
          {turn.error}
        </p>
      )}

      {!turn.streaming && citations.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5 border-t border-dashed border-line pt-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
            Sources
          </span>
          {citations.map((citation, index) => (
            <button
              key={`${keyOf(citation)}-${index}`}
              type="button"
              onClick={(event) => {
                if (!citation.docId) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onPreview(citation, {
                  left: rect.left,
                  top: rect.top,
                  width: rect.width,
                  height: rect.height,
                });
              }}
              onDoubleClick={() => onOpenPage(citation)}
              disabled={!citation.docId}
              className={cn(
                "max-w-full cursor-pointer truncate rounded-md border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink transition-colors",
                "hover:border-ink/30 disabled:cursor-default disabled:opacity-60",
              )}
              title={`${citation.document} — page ${citation.page}`}
            >
              <span className="font-mono text-brand-deep">{index + 1}</span>{" "}
              {citation.document.length > 26
                ? `${citation.document.slice(0, 24)}…`
                : citation.document}{" "}
              <span className="text-ink-muted">p.{citation.page}</span>
              {citation.blockId && <span className="text-ink-muted"> · block</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

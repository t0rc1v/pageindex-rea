"use client";

import { ChevronDown, Paperclip, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { citationKey, parseCitations, splitStreamingTail } from "@/lib/citations";
import { answerRunsFor } from "@/lib/chat-variants";
import type { Citation } from "@/lib/pageindex/types";
import { Markdown } from "@/components/markdown";
import { cn } from "@/components/ui-kit";
import { CitationCard, type CitationAnchor } from "./citation-card";
import { MessageActions } from "./message-actions";
import { Sources } from "./sources";
import { ToolStep } from "./tool-step";
import { useDocIds } from "./use-doc-ids";
import { useTypewriter } from "./use-typewriter";
import { activeRun, runDuration, runText, type ChatTurn, type UseChatResult } from "./use-chat";

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

function Turn({
  turn,
  isLast,
  busy,
  questionVersion,
  resolveDocId,
  answerRef,
  getNode,
  onPreview,
  onOpenPage,
  onRegenerate,
  onSelectRun,
  onFeedback,
  onEdit,
  editing,
  onCancelEdit,
  onSaveEdit,
  question,
}: {
  turn: ChatTurn;
  isLast: boolean;
  busy: boolean;
  /** Which wording of the preceding question this answer turn belongs to. */
  questionVersion: number;
  resolveDocId: (name: string | undefined) => string | undefined;
  answerRef: (node: HTMLElement | null) => void;
  getNode: () => HTMLElement | null;
  onPreview: (citation: Citation, rect: CitationAnchor["rect"], marker: HTMLElement) => void;
  onOpenPage: (citation: Citation) => void;
  onRegenerate: () => void;
  onSelectRun: (index: number) => void;
  onFeedback: (value: "up" | "down") => void;
  onEdit: () => void;
  editing: boolean;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  question?: string;
}) {
  const run = activeRun(turn);
  const { answer } = runText(run);
  const stable = turn.streaming ? splitStreamingTail(answer).stable : answer;
  const revealed = useTypewriter(stable, turn.streaming);
  const citations = useMemo(() => mergeCitations(answer, run.citations), [answer, run.citations]);
  const { thought } = runDuration(run);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const { process } = runText(run);

  if (turn.role === "user") {
    const text = runText(run).answer;
    if (editing) {
      return (
        <div className="group/message flex flex-col items-end gap-1">
          <InlineEditor initial={text} onCancel={onCancelEdit} onSave={onSaveEdit} />
        </div>
      );
    }
    return (
      <div className="group/message flex flex-col items-end gap-1">
        {turn.docs && turn.docs.length > 0 && (
          <div className="flex max-w-[85%] flex-wrap justify-end gap-1">
            {turn.docs.map((doc) => (
              <span
                key={doc.id}
                className="flex min-w-0 items-center gap-1.5 rounded-xl border border-line bg-surface px-2 py-1 text-[11px] text-ink-muted"
              >
                <Paperclip className="size-3 shrink-0" aria-hidden />
                <span className="max-w-[190px] truncate text-ink">{doc.name}</span>
              </span>
            ))}
          </div>
        )}
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-bubble px-3.5 py-2 text-[13.5px] leading-relaxed text-bubble-ink">
          {text}
        </p>
        <MessageActions
          role="user"
          text={text}
          onEdit={onEdit}
          branch={{
            index: turn.active,
            total: turn.runs.length,
            onSelect: onSelectRun,
            label: "question",
          }}
        />
      </div>
    );
  }

  // Only the answers to the visible wording take part in the branch control;
  // the rest answer a previous version of the question.
  const versions = answerRunsFor(turn.runs, questionVersion);
  const versionPosition = Math.max(0, versions.indexOf(turn.active));

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
            <span>{process ? `Thought for ${Math.max(1, Math.round(thought ?? 1))}s` : "Thinking…"}</span>
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
            <p className="pi-enter mt-1 whitespace-pre-wrap border-l border-line pl-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              {process}
            </p>
          )}
        </div>
      )}

      {run.tools.length > 0 && (
        <ul className="flex flex-col">
          {run.tools.map((tool, index) => (
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

      {revealed && (
        <div ref={answerRef} className="group/answer">
          {/* `pending` is the half-received citation tag splitStreamingTail holds
              back; rendering it would flash raw `<doc=...>` markup. */}
          <Markdown compact onCite={onPreview} citations={run.citations}>
            {revealed}
          </Markdown>
        </div>
      )}

      {run.error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-[12px] leading-relaxed text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {run.error}
        </p>
      )}

      {!turn.streaming && (
        <div className="flex flex-col gap-1">
          {/* Rendered even with no prose and with a tool that never reported a
              stop: a failed or interrupted run still needs a way out, and
              Regenerate used to vanish along with the answer. */}
          <MessageActions
            role="assistant"
            text={answer}
            citations={citations}
            question={question}
            at={run.timings?.finishedAt}
            getNode={getNode}
            onRegenerate={isLast ? onRegenerate : undefined}
            canRegenerate={!busy}
            branch={{
              index: versions.length > 0 ? versionPosition : turn.active,
              total: versions.length > 0 ? versions.length : turn.runs.length,
              onSelect: (at) => onSelectRun(versions[at] ?? at),
            }}
            feedback={turn.feedback}
            onFeedback={onFeedback}
          />
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

/**
 * The conversation, and nothing else.
 *
 * It knows nothing about the surface it sits on: `/chat` places it in a
 * scrolling column beside the document panel, and the reader will place it in a
 * side panel with citations resolving into the page underneath.
 * `onOpenCitation` is the whole difference — every route out of a citation,
 * including the ones inside a tool step's sources, goes through it.
 *
 * The preview card lives here because it is anchored to a marker inside the
 * answer, so it has to outlive the surface's own state.
 */
export function ChatTranscript({
  chat,
  onOpenCitation,
}: {
  chat: UseChatResult;
  onOpenCitation: (citation: Citation) => void;
}) {
  const { resolveDocId, withDocId } = useDocIds(chat);
  const [preview, setPreview] = useState<CitationAnchor | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const answerNodes = useRef(new Map<string, HTMLElement>());

  const lastTurnId = chat.turns[chat.turns.length - 1]?.id;
  const question = useMemo(() => {
    const [first] = chat.turns;
    return first ? runText(activeRun(first)).answer : undefined;
  }, [chat.turns]);

  /**
   * The consumer decides where a citation lands, so it receives the citation as
   * it arrived. Only the preview resolves the id first, because it starts
   * fetching a page the moment it opens.
   */
  const openCitation = (citation: Citation) => {
    setPreview(null);
    onOpenCitation(citation);
  };

  return (
    <>
      <div className="flex flex-col gap-8">
        {chat.turns.map((turn, index) => (
          <Turn
            key={turn.id}
            turn={turn}
            isLast={turn.id === lastTurnId}
            busy={chat.busy}
            questionVersion={
              index > 0 && chat.turns[index - 1]!.role === "user"
                ? chat.turns[index - 1]!.active
                : 0
            }
            resolveDocId={resolveDocId}
            answerRef={(node) => {
              if (node) answerNodes.current.set(turn.id, node);
              else answerNodes.current.delete(turn.id);
            }}
            getNode={() => answerNodes.current.get(turn.id) ?? null}
            onPreview={(citation, rect, marker) =>
              setPreview({ citation: withDocId(citation), rect, marker })
            }
            onOpenPage={openCitation}
            onRegenerate={chat.regenerate}
            onSelectRun={(index) => chat.selectRun(turn.id, index)}
            onFeedback={(value) => chat.setFeedback(turn.id, value)}
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

      {preview && (
        <CitationCard anchor={preview} onClose={() => setPreview(null)} onOpenPage={openCitation} />
      )}
    </>
  );
}

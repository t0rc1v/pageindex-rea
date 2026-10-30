"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { parseCitations, resolveCitationDocs } from "@/lib/citations";
import { answerRunIndex } from "@/lib/chat-variants";
import {
  deriveTitle,
  fetchChat,
  newChatId,
  saveChat,
  type StoredChat,
  type StoredRun,
  type StoredTool,
  type TurnTimings,
} from "@/lib/chat-store";
import type { ChatStreamEvent, Citation } from "@/lib/pageindex/types";
import type { PageContext } from "@/lib/page-context";
import { stripCitations } from "@/components/markdown";

export interface ChatRun {
  blocks: Record<number, string>;
  citations: Citation[];
  tools: StoredTool[];
  error?: string;
  timings?: TurnTimings;
  /** Assistant runs: which version of the question this answer replied to. */
  questionRun?: number;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  /**
   * Assistants keep one run per regeneration, users one per edit of the
   * question, so neither a previous answer nor a previous wording is lost: both
   * sit behind a branch control. An assistant run names the question version it
   * answered in `questionRun`.
   */
  runs: ChatRun[];
  active: number;
  streaming: boolean;
  feedback?: "up" | "down";
  /** Documents in scope when the question was asked. */
  docs?: ChatDoc[];
}

export interface ChatDoc {
  id: string;
  name: string;
}

export interface SendOptions {
  /**
   * Work that must finish before the request leaves — the reader pinning the
   * page on screen. The user turn and the stop button appear immediately; only
   * the stream waits. A failure here must not swallow the question.
   */
  beforeStream?: Promise<unknown>;
}

function emptyRun(): ChatRun {
  return { blocks: {}, citations: [], tools: [] };
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function activeRun(turn: ChatTurn): ChatRun {
  return turn.runs[Math.min(turn.active, turn.runs.length - 1)] ?? emptyRun();
}

/** Answer text = the run's last prose block; earlier blocks are narration. */
export function runText(run: ChatRun): { answer: string; process: string } {
  const indexes = Object.keys(run.blocks)
    .map(Number)
    .sort((a, b) => a - b);
  if (indexes.length === 0) return { answer: "", process: "" };
  const last = indexes[indexes.length - 1]!;
  const answer = run.blocks[last] ?? "";
  const process = indexes
    .filter((index) => index !== last)
    .map((index) => run.blocks[index] ?? "")
    .join("\n\n")
    .trim();
  return { answer, process };
}

export function turnText(turn: ChatTurn): { answer: string; process: string } {
  return runText(activeRun(turn));
}

/** Seconds a run spent before its first token / in total. */
export function runDuration(run: ChatRun): { thought?: number; total?: number } {
  const t = run.timings;
  if (!t) return {};
  const end = t.finishedAt ?? t.firstTokenAt ?? t.startedAt;
  const thought = t.firstTokenAt ? (t.firstTokenAt - t.startedAt) / 1000 : undefined;
  return { thought, total: (end - t.startedAt) / 1000 };
}

export function turnDuration(turn: ChatTurn) {
  return runDuration(activeRun(turn));
}

function toStored(
  turns: ChatTurn[],
  docIds: string[],
  docs: ChatDoc[],
  chatId: string,
  createdAt: number,
  originDocId?: string,
): StoredChat {
  const firstUser = turns.find((turn) => turn.role === "user");
  return {
    id: chatId,
    title: deriveTitle(firstUser ? stripCitations(turnText(firstUser).answer) : "New chat"),
    createdAt,
    updatedAt: Date.now(),
    docIds,
    docs,
    ...(originDocId ? { originDocId } : {}),
    turns: turns.map((turn) => ({
      id: turn.id,
      role: turn.role,
      runs: turn.runs.map(
        (run): StoredRun => ({
          blocks: run.blocks,
          citations: run.citations,
          tools: run.tools,
          ...(run.error ? { error: run.error } : {}),
          ...(run.timings ? { timings: run.timings } : {}),
          ...(run.questionRun !== undefined ? { questionRun: run.questionRun } : {}),
        }),
      ),
      activeRun: turn.active,
      ...(turn.feedback ? { feedback: turn.feedback } : {}),
      ...(turn.docs?.length ? { docs: turn.docs } : {}),
    })),
  };
}

function fromStored(chat: StoredChat): ChatTurn[] {
  return chat.turns.map((turn) => ({
    id: turn.id,
    role: turn.role,
    runs: turn.runs.map((run) => ({
      blocks: run.blocks ?? {},
      citations: run.citations ?? [],
      tools: (run.tools ?? []).map((tool) => ({
        ...tool,
        status: tool.status === "start" ? "stop" : tool.status,
      })),
      ...(run.error ? { error: run.error } : {}),
      ...(run.timings ? { timings: run.timings } : {}),
      // Chats stored before edit-variants existed answered the only wording.
      ...(turn.role === "assistant" ? { questionRun: run.questionRun ?? 0 } : {}),
    })),
    active: turn.activeRun ?? 0,
    streaming: false,
    ...(turn.feedback ? { feedback: turn.feedback } : {}),
    ...(turn.docs ? { docs: turn.docs } : {}),
  }));
}

export interface UseChatResult {
  chatId: string | null;
  turns: ChatTurn[];
  docs: ChatDoc[];
  /** Every document the server may cite — resolves a cited name to an id. */
  library: ChatDoc[];
  setDocs: (docs: ChatDoc[]) => void;
  busy: boolean;
  /** Hydrating a stored conversation; the transcript is not ready to answer. */
  loading: boolean;
  send: (text: string, options?: SendOptions) => void;
  regenerate: () => void;
  selectRun: (turnId: string, index: number) => void;
  setFeedback: (turnId: string, value: "up" | "down") => void;
  editAndResend: (turnId: string, text: string) => void;
  stop: () => void;
  reset: () => void;
  /** Pages pinned to the next question. */
  context: PageContext[];
  addContext: (entry: PageContext) => void;
  removeContext: (docId: string, page: number) => void;
  clearContext: () => void;
}

/**
 * The chat lane: managed PageIndex chat (`/api/chat`), streaming normalized
 * events, saving the conversation to the server as it settles.
 *
 * A turn holds a list of runs so "Regenerate" keeps the previous answer behind
 * a branch control instead of destroying it.
 */
export function useChat(options: {
  chatId?: string;
  initialDocs?: ChatDoc[];
  /** Set when this conversation was started inside a document's reader. */
  originDocId?: string;
  /**
   * This id was minted in this tab and has no stored row yet. Skipping the fetch
   * is what makes the first message appear without a `GET /api/chats/:id`
   * round trip and a skeleton in between. Read once on mount: the panel is keyed
   * by chat id, so a fresh chat is exactly the mount that must skip.
   */
  skipHydration?: boolean;
}): UseChatResult {
  const [chatId, setChatId] = useState<string | null>(options.chatId ?? null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [docs, setDocsState] = useState<ChatDoc[]>(options.initialDocs ?? []);
  const skipHydration = useRef(Boolean(options.skipHydration));
  // A stored chat starts loading and is only cleared once its payload lands; the
  // page remounts per chat id, so a navigation never shows stale turns.
  const [loading, setLoading] = useState(
    Boolean(options.chatId) && !options.skipHydration,
  );
  const [library, setLibrary] = useState<ChatDoc[]>(options.initialDocs ?? []);
  const [context, setContext] = useState<PageContext[]>([]);
  const [busy, setBusy] = useState(false);

  // Seeded lazily: calling Date.now() during render is impure and the value is
  // only needed once the first turn is persisted.
  const createdAt = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // A send may wait for a page pin before it opens its stream. Stopping during
  // that wait must cancel the run, not just hide the stop button.
  const runToken = useRef(0);
  /** Removes the assistant placeholder of a send that has not opened its stream. */
  const cancelPending = useRef<(() => void) | null>(null);
  const docsRef = useRef(docs);
  const turnsRef = useRef(turns);
  const contextRef = useRef(context);
  const nameIndexRef = useRef<ChatDoc[]>(options.initialDocs ?? []);

  // A stored conversation now arrives over the network, so the first paint of
  // `/chat/[id]` is a skeleton instead of a synchronous localStorage read.
  // `createdAt` is restored too, or the next save would rewrite its position in
  // Recents with today's timestamp.
  useEffect(() => {
    const id = options.chatId;
    if (!id || skipHydration.current) return;

    let cancelled = false;

    void fetchChat(id)
      .then((stored) => {
        if (cancelled) return;
        if (stored) {
          createdAt.current = stored.createdAt;
          setTurns(fromStored(stored));
          setDocsState(stored.docs?.length ? stored.docs : options.initialDocs ?? []);
        }
        setLoading(false);
      })
      .catch((error: unknown) => {
        console.error("fetchChat", error);
        if (cancelled) return;
        setLoading(false);
        toast.error("Could not open this conversation.");
      });

    return () => {
      cancelled = true;
    };
    // `initialDocs` is only a fallback for chats saved without a scope, and it is
    // undefined on `/chat/[chatId]`, so it cannot retrigger this fetch.
  }, [options.chatId, options.initialDocs]);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  const persist = useCallback((nextTurns: ChatTurn[], nextDocs: ChatDoc[], id: string) => {
    saveChat(
      toStored(
        nextTurns,
        nextDocs.map((doc) => doc.id),
        nextDocs,
        id,
        createdAt.current ?? Date.now(),
        options.originDocId,
      ),
    );
  }, [options.originDocId]);

  const setDocs = useCallback((next: ChatDoc[]) => {
    setDocsState(next);
    docsRef.current = next;
  }, []);

  const stop = useCallback(() => {
    runToken.current += 1;
    // If the stream has not opened yet, the placeholder would otherwise sit on
    // "Thinking…" forever — there is no run whose finally block can settle it.
    cancelPending.current?.();
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
    setChatId(null);
    setContext([]);
    createdAt.current = null;
  }, [stop]);

  /**
   * Pin a page to the next question.
   *
   * Synchronous on purpose: a caller that pins and then sends in the same tick
   * (the reader does) must not race the state update, so the ref is written
   * first and the render follows.
   */
  const addContext = useCallback((entry: PageContext) => {
    const current = contextRef.current;
    if (current.some((item) => item.docId === entry.docId && item.page === entry.page)) return;

    const next = [...current, entry];
    contextRef.current = next;
    setContext(next);
  }, []);

  const removeContext = useCallback((docId: string, page: number) => {
    const next = contextRef.current.filter(
      (item) => !(item.docId === docId && item.page === page),
    );
    contextRef.current = next;
    setContext(next);
  }, []);

  const clearContext = useCallback(() => {
    contextRef.current = [];
    setContext([]);
  }, []);

  /** Stream one assistant run into `assistant.id` at `runIndex`. */
  const startRun = useCallback(
    (base: ChatTurn[], assistantId: string, runIndex: number) => {
      const history = base
        .map((turn) => {
          const { answer } = runText(activeRun(turn));
          return {
            role: turn.role,
            content: turn.role === "user" ? answer : stripCitations(answer),
          };
        })
        .filter((message) => message.content.trim().length > 0);

      let activeId = chatId;
      if (!activeId) {
        activeId = newChatId();
        setChatId(activeId);
        window.history.replaceState(null, "", `/chat/${activeId}`);
      }
      const sessionId = activeId!;

      // Accumulate into one mutable run buffer, then publish a copy. Writing
      // through React state on every token raced with the render→ref sync and
      // silently dropped characters on long streams.
      //
      // The placeholder run already names the question version this answer
      // belongs to; the streamed snapshot must carry it through.
      const queued = turnsRef.current.find((turn) => turn.id === assistantId)?.runs[runIndex];
      const runBuffer: ChatRun = {
        blocks: {},
        citations: [],
        tools: [],
        timings: { startedAt: Date.now() },
        ...(queued?.questionRun !== undefined ? { questionRun: queued.questionRun } : {}),
      };

      const publish = (settled = false) => {
        if (settled) {
          // A stream can end mid-tool (max steps, abort, provider hiccup). Nothing
          // is running once it is over, and a leftover "start" tool would keep
          // the whole actions row — Regenerate included — hidden forever.
          runBuffer.tools = runBuffer.tools.map((tool) =>
            tool.status === "start" ? { ...tool, status: "stop" as const } : tool,
          );
          if (runBuffer.timings && !runBuffer.timings.finishedAt) {
            runBuffer.timings = { ...runBuffer.timings, finishedAt: Date.now() };
          }
        }
        const snapshot: ChatRun = {
          blocks: { ...runBuffer.blocks },
          citations: [...runBuffer.citations],
          tools: runBuffer.tools.map((tool) => ({ ...tool })),
          ...(runBuffer.error ? { error: runBuffer.error } : {}),
          ...(runBuffer.timings ? { timings: { ...runBuffer.timings } } : {}),
          ...(runBuffer.questionRun !== undefined ? { questionRun: runBuffer.questionRun } : {}),
        };
        const next = turnsRef.current.map((turn) => {
          if (turn.id !== assistantId) return turn;
          const runs = turn.runs.map((run, index) => (index === runIndex ? snapshot : run));
          return { ...turn, runs, ...(settled ? { streaming: false } : {}) };
        });
        turnsRef.current = next;
        setTurns(next);
      };

      const controller = new AbortController();
      abortRef.current = controller;

      const run = async () => {
        try {
          const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: history,
              docIds: docsRef.current.map((doc) => doc.id),
              context: contextRef.current.map((item) => ({
                docId: item.docId,
                docName: item.docName,
                page: item.page,
                text: item.text,
              })),
            }),
            signal: controller.signal,
          });

          if (!response.ok || !response.body) {
            let message = `Chat failed (${response.status})`;
            try {
              const payload = (await response.json()) as { error?: string };
              if (payload.error) message = payload.error;
            } catch {
              /* keep default */
            }
            runBuffer.error = message;
            runBuffer.timings = { ...runBuffer.timings!, finishedAt: Date.now() };
            publish(true);
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let currentBlock = 0;

          const handle = (event: ChatStreamEvent) => {
            switch (event.type) {
              case "block":
                currentBlock = event.index;
                break;
              case "text": {
                const block = event.block ?? currentBlock;
                runBuffer.blocks[block] = (runBuffer.blocks[block] ?? "") + event.delta;
                if (!runBuffer.timings?.firstTokenAt) {
                  runBuffer.timings = {
                    ...(runBuffer.timings ?? { startedAt: Date.now() }),
                    firstTokenAt: Date.now(),
                  };
                }
                publish();
                break;
              }
              case "tool": {
                if (event.status === "start") {
                  runBuffer.tools.push({
                    id: event.id ?? `tool-${runBuffer.tools.length + 1}`,
                    name: event.name,
                    status: "start",
                    args: event.args,
                    at: Date.now(),
                  });
                } else {
                  const index = event.id
                    ? runBuffer.tools.findIndex(
                        (tool) => tool.id === event.id && tool.status === "start",
                      )
                    : runBuffer.tools.map((tool) => tool.status).lastIndexOf("start");
                  const target = index === -1 ? runBuffer.tools.length - 1 : index;
                  if (target >= 0) {
                    runBuffer.tools[target] = {
                      ...runBuffer.tools[target]!,
                      name: event.name || runBuffer.tools[target]!.name,
                      status: event.status,
                      args: event.args ?? runBuffer.tools[target]!.args,
                      ...(event.result !== undefined ? { result: event.result } : {}),
                    };
                  }
                }
                publish();
                break;
              }
              case "context":
                nameIndexRef.current = event.docs;
                setLibrary(event.docs);
                runBuffer.citations = resolveCitationDocs(runBuffer.citations, event.docs);
                break;
              case "citations": {
                for (const citation of event.citations) {
                  const key = `${citation.document}|${citation.page}|${citation.blockId ?? ""}`;
                  if (
                    !runBuffer.citations.some(
                      (item) => `${item.document}|${item.page}|${item.blockId ?? ""}` === key,
                    )
                  ) {
                    runBuffer.citations.push(citation as Citation);
                  }
                }
                runBuffer.citations = resolveCitationDocs(runBuffer.citations, nameIndexRef.current);
                publish();
                break;
              }
              case "done":
                runBuffer.timings = { ...runBuffer.timings!, finishedAt: Date.now() };
                publish(true);
                break;
              case "error":
                runBuffer.error = event.message;
                runBuffer.timings = { ...runBuffer.timings!, finishedAt: Date.now() };
                publish(true);
                break;
            }
          };

          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let split = buffer.indexOf("\n\n");
            while (split !== -1) {
              const frame = buffer.slice(0, split);
              buffer = buffer.slice(split + 2);
              split = buffer.indexOf("\n\n");
              const line = frame.split("\n").find((part) => part.startsWith("data:"));
              if (!line) continue;
              try {
                handle(JSON.parse(line.slice(5).trim()) as ChatStreamEvent);
              } catch {
                /* skip malformed frame */
              }
            }
          }
        } catch (error) {
          if ((error as Error).name === "AbortError") {
            runBuffer.timings = { ...runBuffer.timings!, finishedAt: Date.now() };
            publish(true);
          } else {
            runBuffer.error = error instanceof Error ? error.message : "Network error";
            runBuffer.timings = { ...runBuffer.timings!, finishedAt: Date.now() };
            publish(true);
          }
        } finally {
          abortRef.current = null;
          setBusy(false);
          if (runBuffer.citations.length === 0) {
            const tags = parseCitations(runText(runBuffer).answer);
            if (tags.length > 0) {
              const index =
                nameIndexRef.current.length > 0 ? nameIndexRef.current : docsRef.current;
              runBuffer.citations = resolveCitationDocs(tags, index);
            }
          }
          // Always settle: a body that closes without a `done` event (truncated
          // stream, aborted read) must still stop the turn, or the answer sits in
          // "streaming" forever and its actions never render.
          publish(true);
          persist(turnsRef.current, docsRef.current, sessionId);
        }
      };

      void run();
    },
    [chatId, persist],
  );

  const send = useCallback(
    (raw: string, options?: SendOptions) => {
      const text = raw.trim();
      if (!text || busy || loading) return;
      const userTurn: ChatTurn = {
        id: newId("user"),
        role: "user",
        runs: [{ blocks: { 0: text }, citations: [], tools: [], timings: { startedAt: Date.now() } }],
        active: 0,
        streaming: false,
        ...(docsRef.current.length > 0 ? { docs: docsRef.current } : {}),
      };
      const assistantId = newId("assistant");
      const assistantTurn: ChatTurn = {
        id: assistantId,
        role: "assistant",
        runs: [{ ...emptyRun(), timings: { startedAt: Date.now() }, questionRun: 0 }],
        active: 0,
        streaming: true,
      };
      const base = [...turnsRef.current, userTurn];
      const nextTurns = [...base, assistantTurn];
      setTurns(nextTurns);
      turnsRef.current = nextTurns;
      // Mark busy in the same tick as the turns: the message and the stop button
      // must not wait for the request (or a page pin) to begin.
      setBusy(true);

      const token = (runToken.current += 1);
      const abandon = () => {
        cancelPending.current = null;
        const next = turnsRef.current.filter((turn) => turn.id !== assistantId);
        if (next.length === turnsRef.current.length) return;
        turnsRef.current = next;
        setTurns(next);
      };
      const begin = () => {
        if (runToken.current !== token) {
          abandon();
          return;
        }
        cancelPending.current = null;
        startRun(base, assistantId, 0);
      };

      if (options?.beforeStream) {
        cancelPending.current = abandon;
        void options.beforeStream.catch(() => undefined).then(begin);
      } else {
        begin();
      }
    },
    [busy, loading, startRun],
  );

  /** Re-answer the active question version as a new sibling run. */
  const regenerate = useCallback(() => {
    if (busy) return;
    const current = turnsRef.current;
    let lastUser = -1;
    for (let i = current.length - 1; i >= 0; i -= 1) {
      if (current[i]!.role === "user") {
        lastUser = i;
        break;
      }
    }
    if (lastUser === -1) return;

    const question = current[lastUser]!;
    const questionRun = question.active;
    const base = current.slice(0, lastUser + 1);
    const existing = current[lastUser + 1];
    const answerRun: ChatRun = {
      ...emptyRun(),
      timings: { startedAt: Date.now() },
      questionRun,
    };
    const runIndex = existing && existing.role === "assistant" ? existing.runs.length : 0;
    const assistantId = existing && existing.role === "assistant" ? existing.id : newId("assistant");

    const nextTurns =
      existing && existing.role === "assistant"
        ? [
            ...base,
            {
              ...existing,
              streaming: true,
              runs: [...existing.runs, answerRun],
              active: runIndex,
            },
          ]
        : [
            ...base,
            {
              id: assistantId,
              role: "assistant" as const,
              runs: [answerRun],
              active: 0,
              streaming: true,
            },
          ];

    setTurns(nextTurns);
    turnsRef.current = nextTurns;
    setBusy(true);
    startRun(base, assistantId, runIndex);
  }, [busy, startRun]);

  /**
   * Switch variant. A question version and the answer that replied to it move
   * together, so the transcript never shows wording it was not answered with.
   */
  const selectRun = useCallback((turnId: string, index: number) => {
    const current = turnsRef.current;
    const position = current.findIndex((turn) => turn.id === turnId);
    if (position === -1) return;
    const target = current[position]!;
    const chosen = Math.min(Math.max(index, 0), target.runs.length - 1);

    const next = current.map((turn, at) => {
      if (at === position) return { ...turn, active: chosen };
      if (turn.role === "assistant" && at === position + 1 && target.role === "user") {
        return { ...turn, active: answerRunIndex(turn.runs, chosen) };
      }
      if (turn.role === "user" && at === position - 1 && target.role === "assistant") {
        const question = target.runs[chosen]?.questionRun ?? turn.active;
        return { ...turn, active: Math.min(Math.max(question, 0), turn.runs.length - 1) };
      }
      return turn;
    });
    turnsRef.current = next;
    setTurns(next);
    // Which variant is on screen is stored state (`active_run`), so it survives
    // a reload instead of silently resetting to the newest answer.
    if (chatId) persist(next, docsRef.current, chatId);
  }, [chatId, persist]);

  const setFeedback = useCallback(
    (turnId: string, value: "up" | "down") => {
      const next = turnsRef.current.map((turn) =>
        turn.id === turnId
          ? { ...turn, feedback: turn.feedback === value ? undefined : value }
          : turn,
      );
      turnsRef.current = next;
      setTurns(next);
      if (chatId) persist(next, docsRef.current, chatId);
    },
    [chatId, persist],
  );

  /**
   * Edit a question and re-run from that point. The edit becomes a new version
   * of the question and the answer becomes a sibling run, so the previous
   * wording and the answer it got stay reachable behind the branch control.
   */
  const editAndResend = useCallback(
    (turnId: string, raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      const current = turnsRef.current;
      const position = current.findIndex((turn) => turn.id === turnId && turn.role === "user");
      if (position === -1) return;

      const question = current[position]!;
      const version = question.runs.length;
      const userTurn: ChatTurn = {
        ...question,
        runs: [
          ...question.runs,
          { blocks: { 0: text }, citations: [], tools: [], timings: { startedAt: Date.now() } },
        ],
        active: version,
        // The re-ask goes out with the scope selected right now, so the chips
        // above the bubble must show that scope, not the one first used.
        docs: docsRef.current,
      };

      const following = current[position + 1];
      const existing = following?.role === "assistant" ? following : undefined;
      const answerRun: ChatRun = {
        ...emptyRun(),
        timings: { startedAt: Date.now() },
        questionRun: version,
      };
      const runIndex = existing ? existing.runs.length : 0;
      const assistantId = existing?.id ?? newId("assistant");
      const assistantTurn: ChatTurn = existing
        ? { ...existing, runs: [...existing.runs, answerRun], active: runIndex, streaming: true }
        : {
            id: assistantId,
            role: "assistant",
            runs: [answerRun],
            active: 0,
            streaming: true,
          };

      const nextTurns = [...current.slice(0, position), userTurn, assistantTurn];
      setTurns(nextTurns);
      turnsRef.current = nextTurns;
      setBusy(true);
      startRun([...current.slice(0, position), userTurn], assistantId, runIndex);
    },
    [busy, startRun],
  );

  return {
    chatId,
    turns,
    docs,
    library: library.length > 0 ? library : docs,
    setDocs,
    busy,
    loading,
    send,
    regenerate,
    selectRun,
    setFeedback,
    editAndResend,
    stop,
    reset,
    context,
    addContext,
    removeContext,
    clearContext,
  };
}

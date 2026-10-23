"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseCitations, resolveCitationDocs } from "@/lib/citations";
import {
  deriveTitle,
  getChat,
  newChatId,
  saveChat,
  type StoredChat,
  type StoredRun,
  type StoredTool,
  type TurnTimings,
} from "@/lib/chat-store";
import type { ChatStreamEvent, Citation } from "@/lib/pageindex/types";
import { stripCitations } from "@/components/markdown";

export interface ChatRun {
  blocks: Record<number, string>;
  citations: Citation[];
  tools: StoredTool[];
  error?: string;
  timings?: TurnTimings;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  /** Assistants keep one run per regeneration; users hold exactly one. */
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

/** A page pinned into the next question's context ("Add page to chat"). */
export interface PageContext {
  docId: string;
  docName: string;
  page: number;
  text: string;
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
): StoredChat {
  const firstUser = turns.find((turn) => turn.role === "user");
  return {
    id: chatId,
    title: deriveTitle(firstUser ? stripCitations(turnText(firstUser).answer) : "New chat"),
    createdAt,
    updatedAt: Date.now(),
    docIds,
    docs,
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
  send: (text: string) => void;
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
 * events, persisting the conversation in localStorage as it settles.
 *
 * A turn holds a list of runs so "Regenerate" keeps the previous answer behind
 * a branch control instead of destroying it.
 */
export function useChat(options: {
  chatId?: string;
  initialDocs?: ChatDoc[];
}): UseChatResult {
  const [chatId, setChatId] = useState<string | null>(options.chatId ?? null);
  const [turns, setTurns] = useState<ChatTurn[]>(() => {
    if (!options.chatId) return [];
    const stored = getChat(options.chatId);
    return stored ? fromStored(stored) : [];
  });
  const [docs, setDocsState] = useState<ChatDoc[]>(() => {
    if (!options.chatId) return options.initialDocs ?? [];
    const stored = getChat(options.chatId);
    return stored?.docs?.length ? stored.docs : options.initialDocs ?? [];
  });
  const [library, setLibrary] = useState<ChatDoc[]>(options.initialDocs ?? []);
  const [context, setContext] = useState<PageContext[]>([]);
  const [busy, setBusy] = useState(false);

  const createdAt = useRef<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const docsRef = useRef(docs);
  const turnsRef = useRef(turns);
  const contextRef = useRef(context);
  const nameIndexRef = useRef<ChatDoc[]>(options.initialDocs ?? []);

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
    saveChat(toStored(nextTurns, nextDocs.map((doc) => doc.id), nextDocs, id, createdAt.current));
  }, []);

  const setDocs = useCallback((next: ChatDoc[]) => {
    setDocsState(next);
    docsRef.current = next;
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const reset = useCallback(() => {
    stop();
    setTurns([]);
    setChatId(null);
    setContext([]);
    createdAt.current = Date.now();
  }, [stop]);

  const addContext = useCallback((entry: PageContext) => {
    setContext((previous) =>
      previous.some((item) => item.docId === entry.docId && item.page === entry.page)
        ? previous
        : [...previous, entry],
    );
  }, []);

  const removeContext = useCallback((docId: string, page: number) => {
    setContext((previous) =>
      previous.filter((item) => !(item.docId === docId && item.page === page)),
    );
  }, []);

  const clearContext = useCallback(() => setContext([]), []);

  /** Stream one assistant run into `assistant.id` at `runIndex`. */
  const startRun = useCallback(
    (base: ChatTurn[], assistantId: string, runIndex: number) => {
      const history = base
        .map((turn) => {
          const { answer } = runText(turn.runs[turn.runs.length - 1] ?? emptyRun());
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

      const patchRun = (patch: (run: ChatRun) => ChatRun) => {
        const next = turnsRef.current.map((turn) => {
          if (turn.id !== assistantId) return turn;
          const runs = turn.runs.map((run, index) => (index === runIndex ? patch(run) : run));
          return { ...turn, runs };
        });
        turnsRef.current = next;
        setTurns(next);
      };

      const settle = (patch: (run: ChatRun) => ChatRun) => {
        patchRun(patch);
        const next = turnsRef.current.map((turn) =>
          turn.id === assistantId ? { ...turn, streaming: false } : turn,
        );
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
              docs: docsRef.current,
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
            settle((current) => ({
              ...current,
              error: message,
              timings: { ...current.timings!, finishedAt: Date.now() },
            }));
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
              case "text":
                patchRun((current) => {
                  const block = event.block ?? currentBlock;
                  return {
                    ...current,
                    timings: current.timings?.firstTokenAt
                      ? current.timings
                      : {
                          ...(current.timings ?? { startedAt: Date.now() }),
                          firstTokenAt: Date.now(),
                        },
                    blocks: { ...current.blocks, [block]: (current.blocks[block] ?? "") + event.delta },
                  };
                });
                break;
              case "tool":
                patchRun((current) => {
                  if (event.status === "start") {
                    return {
                      ...current,
                      tools: [
                        ...current.tools,
                        {
                          id: event.id ?? `tool-${current.tools.length + 1}`,
                          name: event.name,
                          status: "start",
                          args: event.args,
                          at: Date.now(),
                        },
                      ],
                    };
                  }
                  const tools = [...current.tools];
                  const index = event.id
                    ? tools.findIndex((tool) => tool.id === event.id && tool.status === "start")
                    : tools.map((tool) => tool.status).lastIndexOf("start");
                  const target = index === -1 ? tools.length - 1 : index;
                  if (target >= 0) {
                    tools[target] = {
                      ...tools[target]!,
                      name: event.name || tools[target]!.name,
                      status: event.status,
                      args: event.args ?? tools[target]!.args,
                      ...(event.result !== undefined ? { result: event.result } : {}),
                    };
                  }
                  return { ...current, tools };
                });
                break;
              case "context":
                nameIndexRef.current = event.docs;
                setLibrary(event.docs);
                patchRun((current) => ({
                  ...current,
                  citations: resolveCitationDocs(current.citations, event.docs),
                }));
                break;
              case "citations":
                patchRun((current) => {
                  const merged = [...current.citations];
                  for (const citation of event.citations) {
                    const key = `${citation.document}|${citation.page}|${citation.blockId ?? ""}`;
                    if (
                      !merged.some(
                        (item) => `${item.document}|${item.page}|${item.blockId ?? ""}` === key,
                      )
                    ) {
                      merged.push(citation as Citation);
                    }
                  }
                  return {
                    ...current,
                    citations: resolveCitationDocs(merged, nameIndexRef.current),
                  };
                });
                break;
              case "done":
                settle((current) => ({
                  ...current,
                  timings: { ...current.timings!, finishedAt: Date.now() },
                }));
                break;
              case "error":
                settle((current) => ({
                  ...current,
                  error: event.message,
                  timings: { ...current.timings!, finishedAt: Date.now() },
                }));
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
            settle((current) => ({
              ...current,
              timings: { ...current.timings!, finishedAt: Date.now() },
            }));
          } else {
            settle((current) => ({
              ...current,
              error: error instanceof Error ? error.message : "Network error",
              timings: { ...current.timings!, finishedAt: Date.now() },
            }));
          }
        } finally {
          abortRef.current = null;
          setBusy(false);
          patchRun((current) => {
            if (current.citations.length > 0) return current;
            const tags = parseCitations(runText(current).answer);
            const index =
              nameIndexRef.current.length > 0 ? nameIndexRef.current : docsRef.current;
            return tags.length > 0
              ? { ...current, citations: resolveCitationDocs(tags, index) }
              : current;
          });
          persist(turnsRef.current, docsRef.current, sessionId);
        }
      };

      void run();
    },
    [chatId, persist],
  );

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
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
        runs: [{ ...emptyRun(), timings: { startedAt: Date.now() } }],
        active: 0,
        streaming: true,
      };
      const base = [...turnsRef.current, userTurn];
      const nextTurns = [...base, assistantTurn];
      setTurns(nextTurns);
      turnsRef.current = nextTurns;
      setBusy(true);
      startRun(base, assistantId, 0);
    },
    [busy, startRun],
  );

  /** Re-answer the last question as a new sibling run. */
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

    const base = current.slice(0, lastUser + 1);
    const existing = current[lastUser + 1];
    const runIndex = existing && existing.role === "assistant" ? existing.runs.length : 0;
    const assistantId = existing && existing.role === "assistant" ? existing.id : newId("assistant");

    const nextTurns =
      existing && existing.role === "assistant"
        ? [
            ...base,
            {
              ...existing,
              streaming: true,
              runs: [...existing.runs, { ...emptyRun(), timings: { startedAt: Date.now() } }],
              active: runIndex,
            },
          ]
        : [
            ...base,
            {
              id: assistantId,
              role: "assistant" as const,
              runs: [{ ...emptyRun(), timings: { startedAt: Date.now() } }],
              active: 0,
              streaming: true,
            },
          ];

    setTurns(nextTurns);
    turnsRef.current = nextTurns;
    setBusy(true);
    startRun(base, assistantId, runIndex);
  }, [busy, startRun]);

  const selectRun = useCallback((turnId: string, index: number) => {
    const next = turnsRef.current.map((turn) =>
      turn.id === turnId
        ? { ...turn, active: Math.min(Math.max(index, 0), turn.runs.length - 1) }
        : turn,
    );
    turnsRef.current = next;
    setTurns(next);
  }, []);

  const setFeedback = useCallback((turnId: string, value: "up" | "down") => {
    const next = turnsRef.current.map((turn) =>
      turn.id === turnId
        ? { ...turn, feedback: turn.feedback === value ? undefined : value }
        : turn,
    );
    turnsRef.current = next;
    setTurns(next);
  }, []);

  /** Edit an earlier question and re-run from that point. */
  const editAndResend = useCallback(
    (turnId: string, raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      const current = turnsRef.current;
      const index = current.findIndex((turn) => turn.id === turnId && turn.role === "user");
      if (index === -1) return;
      const base = current.slice(0, index);
      const userTurn: ChatTurn = {
        ...current[index]!,
        runs: [
          {
            ...current[index]!.runs[0]!,
            blocks: { 0: text },
            timings: { startedAt: Date.now() },
          },
        ],
        active: 0,
      };
      const assistantId = newId("assistant");
      const assistantTurn: ChatTurn = {
        id: assistantId,
        role: "assistant",
        runs: [{ ...emptyRun(), timings: { startedAt: Date.now() } }],
        active: 0,
        streaming: true,
      };
      const nextTurns = [...base, userTurn, assistantTurn];
      setTurns(nextTurns);
      turnsRef.current = nextTurns;
      setBusy(true);
      startRun([...base, userTurn], assistantId, 0);
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

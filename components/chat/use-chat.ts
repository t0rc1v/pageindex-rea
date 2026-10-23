"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { parseCitations, resolveCitationDocs } from "@/lib/citations";
import {
  deriveTitle,
  getChat,
  newChatId,
  saveChat,
  type StoredChat,
  type StoredTool,
} from "@/lib/chat-store";
import type { ChatStreamEvent, Citation } from "@/lib/pageindex/types";
import { stripCitations } from "@/components/markdown";

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  /** Text per upstream prose block; the last block is the answer. */
  blocks: Record<number, string>;
  citations: Citation[];
  tools: StoredTool[];
  streaming: boolean;
  error?: string;
}

export interface ChatDoc {
  id: string;
  name: string;
}

function emptyTurn(role: "user" | "assistant", text = ""): ChatTurn {
  return {
    id: `${role}-${Math.random().toString(36).slice(2, 9)}`,
    role,
    blocks: text ? { 0: text } : {},
    citations: [],
    tools: [],
    streaming: role === "assistant",
  };
}

/** Answer text = the last prose block; earlier blocks are narration. */
export function turnText(turn: ChatTurn): { answer: string; process: string } {
  const indexes = Object.keys(turn.blocks)
    .map(Number)
    .sort((a, b) => a - b);
  if (indexes.length === 0) return { answer: "", process: "" };
  const last = indexes[indexes.length - 1]!;
  const answer = turn.blocks[last] ?? "";
  const process = indexes
    .filter((index) => index !== last)
    .map((index) => turn.blocks[index] ?? "")
    .join("\n\n")
    .trim();
  return { answer, process };
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
    turns: turns.map((turn) => {
      const { answer } = turnText(turn);
      return {
        id: turn.id,
        role: turn.role,
        content: answer,
        citations: turn.citations,
        tools: turn.tools,
        ...(turn.error ? { error: turn.error } : {}),
      };
    }),
  };
}

function fromStored(chat: StoredChat): ChatTurn[] {
  return chat.turns.map((turn) => {
    const blocks: Record<number, string> = {};
    if (turn.content) blocks[0] = turn.content;
    return {
      id: turn.id,
      role: turn.role,
      blocks,
      citations: turn.citations,
      tools: turn.tools,
      streaming: false,
      ...(turn.error ? { error: turn.error } : {}),
    };
  });
}

export interface UseChatResult {
  chatId: string | null;
  turns: ChatTurn[];
  docs: ChatDoc[];
  setDocs: (docs: ChatDoc[]) => void;
  busy: boolean;
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
}

/**
 * The chat lane: managed PageIndex chat (`/api/chat`), streaming normalized
 * events, persisting the conversation in localStorage as it settles.
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
  const [busy, setBusy] = useState(false);

  const createdAt = useRef<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);
  const docsRef = useRef(docs);
  const turnsRef = useRef(turns);
  // Documents the server says the answer could cite (the scope, or the whole
  // library when no scope was given). Used to turn cited names into ids.
  const nameIndexRef = useRef<ChatDoc[]>(options.initialDocs ?? []);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);

  const persist = useCallback(
    (nextTurns: ChatTurn[], nextDocs: ChatDoc[], id: string) => {
      saveChat(toStored(nextTurns, nextDocs.map((doc) => doc.id), nextDocs, id, createdAt.current));
    },
    [],
  );

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
    createdAt.current = Date.now();
  }, [stop]);

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;

      const userTurn = emptyTurn("user", text);
      const assistantTurn = emptyTurn("assistant");
      const history = [...turnsRef.current, userTurn]
        .map((turn) => {
          const { answer } = turnText(turn);
          return { role: turn.role, content: turn.role === "user" ? answer : stripCitations(answer) };
        })
        .filter((message) => message.content.trim().length > 0);

      const nextTurns = [...turnsRef.current, userTurn, assistantTurn];
      setTurns(nextTurns);
      turnsRef.current = nextTurns;
      setBusy(true);

      let activeId = chatId;
      if (!activeId) {
        activeId = newChatId();
        setChatId(activeId);
        window.history.replaceState(null, "", `/chat/${activeId}`);
      }

      // The stream applies many patches in order; keep the ref authoritative so
      // the final persist sees every token.
      const patchAssistant = (patch: (turn: ChatTurn) => ChatTurn) => {
        const next = turnsRef.current.map((turn) =>
          turn.id === assistantTurn.id ? patch(turn) : turn,
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
            patchAssistant((turn) => ({ ...turn, streaming: false, error: message }));
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
                patchAssistant((turn) => {
                  const block = event.block ?? currentBlock;
                  return {
                    ...turn,
                    blocks: { ...turn.blocks, [block]: (turn.blocks[block] ?? "") + event.delta },
                  };
                });
                break;
              case "tool":
                patchAssistant((turn) => {
                  if (event.status === "start") {
                    return {
                      ...turn,
                      tools: [
                        ...turn.tools,
                        { name: event.name, status: "start", args: event.args },
                      ],
                    };
                  }
                  const index = turn.tools.map((tool) => tool.status).lastIndexOf("start");
                  if (index === -1) return turn;
                  const tools = [...turn.tools];
                  tools[index] = { name: event.name, status: "stop", args: event.args };
                  return { ...turn, tools };
                });
                break;
              case "context":
                nameIndexRef.current = event.docs;
                patchAssistant((turn) => ({
                  ...turn,
                  citations: resolveCitationDocs(turn.citations, event.docs),
                }));
                break;
              case "citations":
                patchAssistant((turn) => {
                  const merged = [...turn.citations];
                  for (const citation of event.citations) {
                    const key = `${citation.document}|${citation.page}|${citation.blockId ?? ""}`;
                    if (
                      !merged.some(
                        (item) =>
                          `${item.document}|${item.page}|${item.blockId ?? ""}` === key,
                      )
                    ) {
                      merged.push(citation as Citation);
                    }
                  }
                  return {
                    ...turn,
                    citations: resolveCitationDocs(merged, nameIndexRef.current),
                  };
                });
                break;
              case "done":
                patchAssistant((turn) => ({ ...turn, streaming: false }));
                break;
              case "error":
                patchAssistant((turn) => ({ ...turn, streaming: false, error: event.message }));
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
            patchAssistant((turn) => ({ ...turn, streaming: false }));
          } else {
            patchAssistant((turn) => ({
              ...turn,
              streaming: false,
              error: error instanceof Error ? error.message : "Network error",
            }));
          }
        } finally {
          abortRef.current = null;
          setBusy(false);
          patchAssistant((turn) => {
            if (turn.citations.length > 0) return turn;
            const tags = parseCitations(turnText(turn).answer);
            const index =
              nameIndexRef.current.length > 0 ? nameIndexRef.current : docsRef.current;
            return tags.length > 0
              ? { ...turn, citations: resolveCitationDocs(tags, index) }
              : turn;
          });
          persist(turnsRef.current, docsRef.current, activeId!);
        }
      };

      void run();
    },
    [busy, chatId, persist],
  );

  return { chatId, turns, docs, setDocs, busy, send, stop, reset };
}

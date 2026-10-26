"use client";

import { toast } from "sonner";

import type {
  DocRef,
  StoredChat,
  StoredCitation,
  StoredRun,
  StoredTool,
  StoredTurn,
  TurnTimings,
} from "./chat-types";

/** Call sites import these shapes from the store; the definitions live in chat-types. */
export type {
  DocRef,
  StoredChat,
  StoredCitation,
  StoredRun,
  StoredTool,
  StoredTurn,
  TurnTimings,
} from "./chat-types";

/**
 * Conversations live in Neon, scoped to the caller's tenant and authored by the
 * caller. This module is the browser half of that: a module-level cache the
 * sidebar can subscribe to synchronously, plus the write path.
 *
 * Writes are serialized per chat id. Two saves can race — a rename while a
 * stream settles, say — and the last write wins only if it also arrives last.
 */

const LEGACY_KEY = "pageindex-reader/chats/v1";
const MIGRATED_KEY = "pageindex-reader/chats/migrated-to-neon-v1";
const MAX_CHATS = 60;

let cache: StoredChat[] = [];
let hydrated = false;
let inflight: Promise<void> | null = null;

const listeners = new Set<() => void>();
const writes = new Map<string, Promise<void>>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeChats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getChatsSnapshot(): StoredChat[] {
  return cache;
}

const EMPTY: StoredChat[] = [];

export function getChatsServerSnapshot(): StoredChat[] {
  return EMPTY;
}

/**
 * Pull Recents from the server, importing anything left in localStorage first.
 *
 * Idempotent: the first caller performs the work, later ones join it. `force`
 * re-fetches after a failed mutation, where the cache may have drifted.
 */
export function hydrateChats(force = false): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (inflight) return inflight;
  if (hydrated && !force) return Promise.resolve();

  inflight = (async () => {
    await importLegacyChats();

    const response = await fetch("/api/chats");
    if (!response.ok) throw new Error(`GET /api/chats → ${response.status}`);

    const payload = (await response.json()) as { chats: StoredChat[] };
    cache = payload.chats.slice(0, MAX_CHATS);
    hydrated = true;
    emit();
  })()
    .catch((error: unknown) => {
      console.error("hydrateChats", error);
      toast.error("Could not load your conversations.");
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export async function fetchChat(id: string): Promise<StoredChat | null> {
  const response = await fetch(`/api/chats/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET /api/chats/${id} → ${response.status}`);

  const payload = (await response.json()) as { chat: StoredChat };
  return payload.chat;
}

/** Persist a conversation, keeping Recents in step optimistically. */
export function saveChat(chat: StoredChat): void {
  if (typeof window === "undefined") return;

  rememberChat(chat);

  const previous = writes.get(chat.id) ?? Promise.resolve();
  const next = previous
    .then(() => putChat(chat))
    .catch((error: unknown) => {
      console.error("saveChat", error);
      toast.error("Could not save this conversation.");
    });

  writes.set(chat.id, next);
  void next.finally(() => {
    if (writes.get(chat.id) === next) writes.delete(chat.id);
  });
}

async function putChat(chat: StoredChat): Promise<void> {
  const response = await fetch(`/api/chats/${encodeURIComponent(chat.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: chat.title,
      createdAt: chat.createdAt,
      scopeDocs: chat.docs,
      turns: chat.turns,
    }),
  });

  if (!response.ok) throw new Error(`PUT /api/chats/${chat.id} → ${response.status}`);
}

function rememberChat(chat: StoredChat) {
  const summary: StoredChat = {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    docIds: chat.docIds,
    docs: chat.docs,
    turns: [],
  };

  cache = [summary, ...cache.filter((item) => item.id !== chat.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS);
  emit();
}

export function renameChat(id: string, title: string): void {
  const trimmed = title.trim().slice(0, 200);
  if (!trimmed) return;

  cache = cache
    .map((chat) => (chat.id === id ? { ...chat, title: trimmed, updatedAt: Date.now() } : chat))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  emit();

  void fetch(`/api/chats/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: trimmed }),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`PATCH → ${response.status}`);
    })
    .catch((error: unknown) => {
      console.error("renameChat", error);
      toast.error("Could not rename that conversation.");
      void hydrateChats(true);
    });
}

export function deleteChat(id: string): void {
  cache = cache.filter((chat) => chat.id !== id);
  emit();

  void fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" })
    .then((response) => {
      if (!response.ok && response.status !== 404) {
        throw new Error(`DELETE → ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      console.error("deleteChat", error);
      toast.error("Could not delete that conversation.");
      void hydrateChats(true);
    });
}

export async function clearChats(): Promise<void> {
  cache = [];
  emit();

  const response = await fetch("/api/chats", { method: "DELETE" }).catch(() => null);
  if (!response?.ok) {
    toast.error("Could not clear your conversations.");
    await hydrateChats(true);
  }
}

export function newChatId(): string {
  return crypto.randomUUID();
}

/** First user line, trimmed to a sidebar-friendly title. */
export function deriveTitle(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  const cleaned = line.replace(/\s+/g, " ");
  if (cleaned.length <= 52) return cleaned || "New chat";
  return `${cleaned.slice(0, 50).trimEnd()}…`;
}

/**
 * One-shot import of the localStorage era.
 *
 * Chats from earlier builds are uploaded under their existing ids, so `/chat/c_…`
 * links keep working. The local copy is only dropped once every upload answered
 * 2xx; a failed import is retried on the next load instead of being lost.
 */
async function importLegacyChats(): Promise<void> {
  if (window.localStorage.getItem(MIGRATED_KEY)) return;

  const raw = window.localStorage.getItem(LEGACY_KEY);
  if (!raw) {
    window.localStorage.setItem(MIGRATED_KEY, "1");
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }

  const chats = Array.isArray(parsed)
    ? parsed.map(normalizeLegacyChat).filter((chat): chat is StoredChat => chat !== null)
    : [];

  for (const chat of chats) {
    try {
      await putChat(chat);
    } catch (error) {
      console.error("importLegacyChats", error);
      return;
    }
  }

  window.localStorage.removeItem(LEGACY_KEY);
  window.localStorage.setItem(MIGRATED_KEY, new Date().toISOString());
}

/**
 * Earlier builds stored a turn as a flat `content`/`citations`/`tools` triple
 * with no run history. Fold those into a single run on read.
 */
function normalizeLegacyChat(raw: unknown): StoredChat | null {
  if (!raw || typeof raw !== "object") return null;
  const chat = raw as Partial<StoredChat> & { turns?: unknown };

  if (typeof chat.id !== "string" || !chat.id) return null;
  if (!Array.isArray(chat.turns)) return null;

  const turns = chat.turns
    .map(normalizeLegacyTurn)
    .filter((turn): turn is StoredTurn => turn !== null);

  const docs = Array.isArray(chat.docs) ? (chat.docs as DocRef[]) : [];
  const now = Date.now();

  return {
    id: chat.id,
    title: typeof chat.title === "string" && chat.title.trim() ? chat.title : "New chat",
    createdAt: typeof chat.createdAt === "number" ? chat.createdAt : now,
    updatedAt: typeof chat.updatedAt === "number" ? chat.updatedAt : now,
    docIds: Array.isArray(chat.docIds)
      ? chat.docIds
      : docs.map((doc) => doc.id),
    docs,
    turns,
  };
}

function normalizeLegacyTurn(raw: unknown): StoredTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const turn = raw as Partial<StoredTurn> & {
    content?: string;
    citations?: StoredCitation[];
    tools?: StoredTool[];
    error?: string;
    timings?: TurnTimings;
  };

  if (typeof turn.id !== "string") return null;
  if (turn.role !== "user" && turn.role !== "assistant") return null;

  if (Array.isArray(turn.runs) && turn.runs.length > 0) {
    const activeRun = Math.min(Math.max(turn.activeRun ?? turn.runs.length - 1, 0), turn.runs.length - 1);
    return {
      id: turn.id,
      role: turn.role,
      runs: turn.runs,
      activeRun,
      ...(turn.feedback ? { feedback: turn.feedback } : {}),
      ...(Array.isArray(turn.docs) && turn.docs.length > 0 ? { docs: turn.docs } : {}),
    };
  }

  const run: StoredRun = {
    blocks: turn.content ? { 0: turn.content } : {},
    citations: turn.citations ?? [],
    tools: turn.tools ?? [],
    ...(turn.error ? { error: turn.error } : {}),
    ...(turn.timings ? { timings: turn.timings } : {}),
  };

  return {
    id: turn.id,
    role: turn.role,
    runs: [run],
    activeRun: 0,
  };
}

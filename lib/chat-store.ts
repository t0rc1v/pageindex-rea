"use client";

/**
 * Conversations live in this browser.
 *
 * The Cloud API has no conversation/resource endpoint — chats belong to the
 * product around it, not to the index. The official app stores them server-side
 * behind its own auth; this single-user reader persists them in localStorage so
 * the sidebar's Recents list survives reloads without inventing a backend.
 */

export interface StoredCitation {
  document: string;
  page: number;
  blockId?: string;
  blockType?: string;
  bbox?: [number, number, number, number];
  docId?: string;
}

export interface StoredTool {
  /** Stable per-run id so a later stop event can address its own start. */
  id?: string;
  name: string;
  status: "start" | "stop" | "error";
  args?: unknown;
  /** Present on the MCP lane, which returns real tool payloads. */
  result?: unknown;
  at?: number;
}

/** Wall-clock timings, used for the collapsed "Thought for Ns" row. */
export interface TurnTimings {
  startedAt: number;
  firstTokenAt?: number;
  finishedAt?: number;
}

/**
 * One response. Regenerate appends a sibling run instead of overwriting, so the
 * previous answer stays reachable behind the branch control.
 */
export interface StoredRun {
  blocks: Record<number, string>;
  citations: StoredCitation[];
  tools: StoredTool[];
  error?: string;
  timings?: TurnTimings;
}

export interface StoredTurn {
  id: string;
  role: "user" | "assistant";
  /** Assistants: one per regeneration. Users: exactly one. */
  runs: StoredRun[];
  activeRun: number;
  feedback?: "up" | "down";
  /** Documents in scope when the question was asked. */
  docs?: Array<{ id: string; name: string }>;
}

export interface StoredChat {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  docIds: string[];
  docs: Array<{ id: string; name: string }>;
  turns: StoredTurn[];
}

/**
 * Earlier builds stored a turn as a flat `content`/`citations`/`tools` triple
 * with no run history. Fold those into a single run on read.
 */
function migrateTurn(raw: unknown): StoredTurn | null {
  if (!raw || typeof raw !== "object") return null;
  const turn = raw as Partial<StoredTurn> & {
    content?: string;
    citations?: StoredCitation[];
    tools?: StoredTool[];
    error?: string;
    timings?: TurnTimings;
  };
  if (typeof turn.id !== "string" || (turn.role !== "user" && turn.role !== "assistant")) {
    return null;
  }
  if (Array.isArray(turn.runs) && turn.runs.length > 0) {
    const activeRun = Math.min(Math.max(turn.activeRun ?? turn.runs.length - 1, 0), turn.runs.length - 1);
    return {
      id: turn.id,
      role: turn.role,
      runs: turn.runs,
      activeRun,
      ...(turn.feedback ? { feedback: turn.feedback } : {}),
      ...(turn.docs ? { docs: turn.docs } : {}),
    };
  }
  return {
    id: turn.id,
    role: turn.role,
    runs: [
      {
        blocks: turn.content ? { 0: turn.content } : {},
        citations: turn.citations ?? [],
        tools: turn.tools ?? [],
        ...(turn.error ? { error: turn.error } : {}),
        ...(turn.timings ? { timings: turn.timings } : {}),
      },
    ],
    activeRun: 0,
  };
}

const STORAGE_KEY = "pageindex-reader/chats/v1";
const MAX_CHATS = 60;

let cache: StoredChat[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function read(): StoredChat[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredChat[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((chat) => chat && typeof chat.id === "string" && Array.isArray(chat.turns))
      .map((chat) => ({
        ...chat,
        turns: chat.turns.map(migrateTurn).filter((turn): turn is StoredTurn => turn !== null),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function emit() {
  cache = read();
  for (const listener of listeners) listener();
}

function ensureLoaded() {
  if (loaded) return;
  cache = read();
  loaded = true;
}

export function subscribeChats(listener: () => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) emit();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getChatsSnapshot(): StoredChat[] {
  ensureLoaded();
  return cache;
}

const EMPTY: StoredChat[] = [];
export function getChatsServerSnapshot(): StoredChat[] {
  return EMPTY;
}

export function getChat(id: string): StoredChat | undefined {
  ensureLoaded();
  return cache.find((chat) => chat.id === id);
}

export function saveChat(chat: StoredChat): void {
  if (typeof window === "undefined") return;
  ensureLoaded();
  const next = [chat, ...cache.filter((item) => item.id !== chat.id)]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CHATS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  emit();
}

export function deleteChat(id: string): void {
  if (typeof window === "undefined") return;
  ensureLoaded();
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(cache.filter((chat) => chat.id !== id)),
  );
  emit();
}

export function renameChat(id: string, title: string): void {
  const chat = getChat(id);
  if (!chat) return;
  saveChat({ ...chat, title: title.trim() || chat.title, updatedAt: Date.now() });
}

export function clearChats(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  emit();
}

export function newChatId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** First user line, trimmed to a sidebar-friendly title. */
export function deriveTitle(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  const cleaned = line.replace(/\s+/g, " ");
  if (cleaned.length <= 52) return cleaned || "New chat";
  return `${cleaned.slice(0, 50).trimEnd()}…`;
}

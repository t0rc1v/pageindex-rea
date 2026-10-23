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
  name: string;
  status: "start" | "stop";
  args?: unknown;
}

export interface StoredTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: StoredCitation[];
  tools: StoredTool[];
  error?: string;
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

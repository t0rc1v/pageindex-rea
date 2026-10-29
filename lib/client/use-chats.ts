"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  getChatsServerSnapshot,
  getChatsSnapshot,
  getChatsStatus,
  getDocChatsReady,
  getDocChatsServerSnapshot,
  getDocChatsSnapshot,
  hydrateChats,
  hydrateDocChats,
  subscribeChats,
  type ChatsStatus,
  type StoredChat,
} from "@/lib/chat-store";

/**
 * Recents, from the module cache. Hydration is triggered here because every
 * surface that renders the list (sidebar, settings) goes through this hook, and
 * `hydrateChats` collapses concurrent callers into one fetch.
 */
export function useChats(): StoredChat[] {
  const chats = useSyncExternalStore(subscribeChats, getChatsSnapshot, getChatsServerSnapshot);

  useEffect(() => {
    void hydrateChats();
  }, []);

  return chats;
}

/**
 * One document's conversations, newest first.
 *
 * A different list, not a filtered copy of Recents: the server keeps them apart
 * and so does the cache. `ready` separates "no chats in this document" from
 * "the request has not answered yet".
 */
export function useDocChats(docId: string): { chats: StoredChat[]; ready: boolean } {
  const chats = useSyncExternalStore(
    subscribeChats,
    () => getDocChatsSnapshot(docId),
    getDocChatsServerSnapshot,
  );
  const ready = useSyncExternalStore(
    subscribeChats,
    () => getDocChatsReady(docId),
    () => false,
  );

  useEffect(() => {
    void hydrateDocChats(docId);
  }, [docId]);

  return { chats, ready };
}

/** Server render and the first client paint both report `loading`. */
const SERVER_STATUS: ChatsStatus = "loading";

/**
 * The fetch state behind `useChats`. A count of zero means "none" only once this
 * reports `ready`; before that the list is simply unknown.
 */
export function useChatsStatus(): ChatsStatus {
  return useSyncExternalStore(subscribeChats, getChatsStatus, () => SERVER_STATUS);
}

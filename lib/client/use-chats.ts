"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  getChatsServerSnapshot,
  getChatsSnapshot,
  getChatsStatus,
  hydrateChats,
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

/** Server render and the first client paint both report `loading`. */
const SERVER_STATUS: ChatsStatus = "loading";

/**
 * The fetch state behind `useChats`. A count of zero means "none" only once this
 * reports `ready`; before that the list is simply unknown.
 */
export function useChatsStatus(): ChatsStatus {
  return useSyncExternalStore(subscribeChats, getChatsStatus, () => SERVER_STATUS);
}

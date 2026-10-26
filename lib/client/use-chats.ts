"use client";

import { useEffect, useSyncExternalStore } from "react";

import {
  getChatsServerSnapshot,
  getChatsSnapshot,
  hydrateChats,
  subscribeChats,
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

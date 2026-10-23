"use client";

import { useSyncExternalStore } from "react";

import {
  getChatsServerSnapshot,
  getChatsSnapshot,
  subscribeChats,
  type StoredChat,
} from "@/lib/chat-store";

export function useChats(): StoredChat[] {
  return useSyncExternalStore(subscribeChats, getChatsSnapshot, getChatsServerSnapshot);
}

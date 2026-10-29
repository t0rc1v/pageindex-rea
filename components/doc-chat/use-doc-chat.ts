"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { deleteChat, newChatId, renameChat } from "@/lib/chat-store";
import { useDocChats } from "@/lib/client/use-chats";
import type { StoredChat } from "@/lib/chat-types";

/** The address-bar parameter that keeps a doc chat open across reloads. */
export const DOC_CHAT_PARAM = "chat";

export interface PendingMessage {
  id: string;
  text: string;
}

export interface DocChat {
  chats: StoredChat[];
  /** False until this document's list has answered; an empty menu says "loading". */
  ready: boolean;
  activeId: string | null;
  open: boolean;
  /** A question typed into the document's composer, waiting for the panel to mount. */
  pending: PendingMessage | null;
  startChat: (text: string) => void;
  newChat: () => void;
  openChat: (id: string) => void;
  close: () => void;
  clearPending: () => void;
  rename: (id: string, title: string) => void;
  remove: (id: string) => void;
}

/**
 * The conversation state of one document's reader.
 *
 * Split deliberately from `useChat`: this owns *which* conversation is on screen
 * and whether the panel is open, while the panel owns the transcript of exactly
 * one chat id. That is what lets the document composer start a second
 * conversation while the first is still streaming.
 *
 * Ids are minted here, before the first save, for the same reason `/chat` mints
 * them: the URL has to name the chat while its first answer streams. A minted id
 * that is never sent to is not written anywhere, so "New chat" leaves no empty
 * rows behind.
 */
export function useDocChat(docId: string): DocChat {
  const { chats, ready } = useDocChats(docId);
  const params = useSearchParams();

  // `?chat=` restores the panel after a reload, or from a shared reader link.
  // Read as the initial value rather than copied in an effect: the URL is the
  // source of truth on the way in, and state is the source of truth afterwards.
  const fromUrl = params.get(DOC_CHAT_PARAM);
  const [activeId, setActiveId] = useState<string | null>(fromUrl);
  const [open, setOpen] = useState(Boolean(fromUrl));
  const [pending, setPending] = useState<PendingMessage | null>(null);

  /**
   * Keep the reader link shareable.
   *
   * The other half of this lives in `DocView`, which rewrites `page` and `block`
   * on the same URL; both read the current href before writing, so neither
   * drops the other's parameters.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (open && activeId) url.searchParams.set(DOC_CHAT_PARAM, activeId);
    else url.searchParams.delete(DOC_CHAT_PARAM);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [open, activeId]);

  const startChat = useCallback((text: string) => {
    const id = newChatId();
    setActiveId(id);
    setOpen(true);
    setPending({ id, text });
  }, []);

  const newChat = useCallback(() => {
    setActiveId(newChatId());
    setOpen(true);
    setPending(null);
  }, []);

  const openChat = useCallback((id: string) => {
    setActiveId(id);
    setOpen(true);
    setPending(null);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setPending(null);
  }, []);

  const clearPending = useCallback(() => setPending(null), []);

  const rename = useCallback((id: string, title: string) => {
    renameChat(id, title);
  }, []);

  const remove = useCallback(
    (id: string) => {
      deleteChat(id);
      if (activeId === id) {
        setOpen(false);
        setActiveId(null);
      }
    },
    [activeId],
  );

  return {
    chats,
    ready,
    activeId,
    open,
    pending,
    startChat,
    newChat,
    openChat,
    close,
    clearPending,
    rename,
    remove,
  };
}

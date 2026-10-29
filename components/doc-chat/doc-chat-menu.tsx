"use client";

import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { StoredChat } from "@/lib/chat-types";
import { formatRelative } from "@/lib/format";
import { Button, cn } from "@/components/ui-kit";

/**
 * The document's Chat menu.
 *
 * Gloss's notebook button toggles a panel. This one can't: a document holds many
 * conversations, so the button has to answer "which one" first. It lists them by
 * recency with new/rename/delete, and picking one opens it in the panel.
 *
 * The same control sits in the reader header and in the panel header, so
 * switching conversations never means going back to the document first.
 */
export function DocChatMenu({
  chats,
  ready,
  activeId,
  onOpen,
  onNew,
  onRename,
  onDelete,
  align = "end",
}: {
  chats: StoredChat[];
  ready: boolean;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const rename = (chat: StoredChat) => {
    const next = window.prompt("Rename chat", chat.title);
    if (next?.trim()) onRename(chat.id, next);
  };

  return (
    <div className="relative" ref={root}>
      <Button
        size="sm"
        variant="secondary"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <MessageSquare className="size-3.5" aria-hidden />
        <span className="ml-1.5 hidden sm:inline">Chat</span>
        {chats.length > 0 && (
          <span className="ml-1.5 min-w-[16px] rounded-full bg-paper px-1 text-center font-mono text-[10px] leading-4 text-ink-muted">
            {chats.length}
          </span>
        )}
      </Button>

      {open && (
        <div
          role="menu"
          aria-label="Chats in this document"
          className={cn(
            "absolute top-9 z-40 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface p-1.5 shadow-xl",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onNew();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-ink transition-colors hover:bg-paper"
          >
            <Plus className="size-3.5 text-ink-muted" aria-hidden />
            New chat
          </button>

          <div className="my-1 h-px bg-line" />

          {!ready ? (
            <p className="px-2 py-3 text-[12px] text-ink-muted">Loading chats…</p>
          ) : chats.length === 0 ? (
            <p className="px-2 py-3 text-[12px] leading-relaxed text-ink-muted">
              No chats in this document yet. Ask something below.
            </p>
          ) : (
            <ul className="flex max-h-72 flex-col overflow-y-auto">
              {chats.map((chat) => (
                <li key={chat.id} className="group/item relative">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onOpen(chat.id);
                    }}
                    onDoubleClick={() => rename(chat)}
                    aria-current={chat.id === activeId ? "true" : undefined}
                    title={chat.title}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 rounded-lg py-1.5 pl-2 pr-8 text-left text-[12.5px] transition-colors hover:bg-paper",
                      chat.id === activeId ? "bg-paper text-ink" : "text-ink",
                    )}
                  >
                    <span className="truncate">{chat.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9.5px] text-ink-muted">
                      {formatRelative(new Date(chat.updatedAt).toISOString())}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${chat.title}`}
                    onClick={() => rename(chat)}
                    className="absolute right-7 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-ink-muted transition-opacity hover:text-ink sm:opacity-0 sm:group-hover/item:opacity-100 focus-visible:opacity-100"
                  >
                    <Pencil className="size-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${chat.title}`}
                    onClick={() => onDelete(chat.id)}
                    className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded text-ink-muted transition-opacity hover:text-ink sm:opacity-0 sm:group-hover/item:opacity-100 focus-visible:opacity-100"
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="px-2 pb-0.5 pt-1 text-[10px] text-ink-muted/80">
            Kept with this document, not in Recents.
          </p>
        </div>
      )}
    </div>
  );
}

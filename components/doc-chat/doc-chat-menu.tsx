"use client";

import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { StoredChat } from "@/lib/chat-types";
import { formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteChatDialog, RenameChatDialog } from "@/components/chat/chat-actions";

/**
 * The document's Chat menu.
 *
 * Gloss's notebook button toggles a panel. This one can't: a document holds many
 * conversations, so the button has to answer "which one" first. It lists them by
 * recency with new/rename/delete, and picking one opens it in the panel.
 *
 * The same control sits in the reader header and in the panel header, so
 * switching conversations never means going back to the document first.
 *
 * The shadcn menu portals its content, which is what keeps the reader's copy out
 * of the page and away from the sidebar when the header is tight.
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
  const [renameTarget, setRenameTarget] = useState<StoredChat | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoredChat | null>(null);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          render={<Button size="sm" variant="secondary" />}
        >
          <MessageSquare className="size-3.5" aria-hidden />
          <span className="ml-1.5 hidden sm:inline">Chat</span>
          {chats.length > 0 && (
            <span className="ml-1.5 min-w-[16px] rounded-full bg-paper px-1 text-center font-mono text-[10px] leading-4 text-ink-muted">
              {chats.length}
            </span>
          )}
        </DropdownMenuTrigger>

        <DropdownMenuContent
          aria-label="Chats in this document"
          align={align}
          sideOffset={6}
          className="max-w-[calc(100vw-2rem)] p-1.5"
          style={{ width: "19rem" }}
        >
          <DropdownMenuItem
            onClick={() => {
              setOpen(false);
              onNew();
            }}
          >
            <Plus className="size-3.5 text-ink-muted" aria-hidden />
            New chat
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {!ready ? (
            <p className="px-2 py-3 text-[12px] text-ink-muted">Loading chats…</p>
          ) : chats.length === 0 ? (
            <p className="px-2 py-3 text-[12px] leading-relaxed text-ink-muted">
              No chats in this document yet. Ask something below.
            </p>
          ) : (
            <div className="flex max-h-72 flex-col overflow-y-auto">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className="group/item relative flex items-center rounded-lg"
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setOpen(false);
                      onOpen(chat.id);
                    }}
                    aria-current={chat.id === activeId ? "true" : undefined}
                    title={chat.title}
                    className="min-w-0 flex-1 py-1.5 pr-14 pl-2 text-[12.5px] aria-[current=true]:bg-paper"
                  >
                    <span className="truncate">{chat.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-[9.5px] text-ink-muted">
                      {formatRelative(new Date(chat.updatedAt).toISOString())}
                    </span>
                  </DropdownMenuItem>

                  <div className="absolute top-1/2 right-1.5 z-10 flex -translate-y-1/2 items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover/item:opacity-100 sm:focus-within:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Rename ${chat.title}`}
                      onClick={() => {
                        setOpen(false);
                        setRenameTarget(chat);
                      }}
                    >
                      <Pencil className="size-3" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${chat.title}`}
                      onClick={() => {
                        setOpen(false);
                        setDeleteTarget(chat);
                      }}
                    >
                      <Trash2 className="size-3" aria-hidden />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="px-2 pt-1 pb-0.5 text-[10px] text-ink-muted/80">
            Kept with this document, not in Recents.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameChatDialog
        chat={renameTarget}
        onClose={() => setRenameTarget(null)}
        onRename={(title) => {
          if (renameTarget) onRename(renameTarget.id, title);
        }}
      />
      <DeleteChatDialog
        chat={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDelete={() => {
          if (deleteTarget) onDelete(deleteTarget.id);
        }}
      />
    </>
  );
}

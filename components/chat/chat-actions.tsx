"use client";

import { Ellipsis, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export interface ChatTarget {
  id: string;
  title: string;
}

/**
 * The kebab used by the sidebar's Recents rows.
 *
 * Callers render `RenameChatDialog` / `DeleteChatDialog` outside the menu on
 * purpose: a menu closes when focus moves into a dialog, and a dialog rendered
 * inside the closing popup would unmount before it could appear.
 */
export function ChatActionsMenu({
  chat,
  onRename,
  onDelete,
  align = "end",
  trigger,
}: {
  chat: ChatTarget;
  onRename: () => void;
  onDelete: () => void;
  align?: "start" | "end";
  /** A styled trigger (e.g. `SidebarMenuAction`); the icon is passed as its child. */
  trigger?: React.ReactElement;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          trigger ?? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${chat.title}`}
            />
          )
        }
      >
        <Ellipsis className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-36">
        <DropdownMenuItem onClick={onRename}>
          <Pencil className="size-3.5" aria-hidden />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 className="size-3.5" aria-hidden />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Rename one conversation. Mounted only while there is a target, so the draft
 * starts from that chat's title without copying state in an effect.
 */
export function RenameChatDialog({
  chat,
  onClose,
  onRename,
}: {
  chat: ChatTarget | null;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  if (!chat) return null;
  return (
    <RenameChatDialogInner
      key={`${chat.id}:${chat.title}`}
      chat={chat}
      onClose={onClose}
      onRename={onRename}
    />
  );
}

function RenameChatDialogInner({
  chat,
  onClose,
  onRename,
}: {
  chat: ChatTarget;
  onClose: () => void;
  onRename: (title: string) => void;
}) {
  const [draft, setDraft] = useState(chat.title);
  const next = draft.trim();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename chat</DialogTitle>
          <DialogDescription>Give this conversation a clearer name.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!next) return;
            onRename(next);
            onClose();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label="Chat title"
            maxLength={200}
            placeholder="Chat title"
          />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={!next}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Delete one conversation, with the irreversible step behind a confirmation. */
export function DeleteChatDialog({
  chat,
  onClose,
  onDelete,
}: {
  chat: ChatTarget | null;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (!chat) return null;

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete chat?</AlertDialogTitle>
          <AlertDialogDescription>
            “{chat.title}” will be permanently deleted. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              onDelete();
              onClose();
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

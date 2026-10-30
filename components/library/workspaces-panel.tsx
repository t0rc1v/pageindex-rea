"use client";

import {
  ChevronDown,
  Ellipsis,
  Folder,
  FolderPlus,
  Inbox,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { cn } from "cn";

import { ApiError, apiSend } from "@/lib/client/api";
import { useFetch, useLocalFlag } from "@/lib/client/hooks";
import type { FolderListResponse, PageIndexFolder } from "@/lib/pageindex/types";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ErrorPanel, Skeleton, Spinner } from "@/components/ui-kit";

/** `"all"`, `"root"` (documents with no folder), or a folder id. */
export type FolderFilter = "all" | "root" | string;

const FOLDERS_OPEN_KEY = "pageindex-reader/library/folders-open";

/**
 * The library's workspace rail.
 *
 * Two layouts share one body: a persistent panel on desktop (collapsible to an
 * icon rail, like the app sidebar) and a Sheet below `lg`, where the content
 * column is too narrow to keep a 14rem panel beside it. The header, the fixed
 * scopes and the footer never scroll; only the folder rows do.
 */
export function WorkspacesPanel({
  active,
  allTotal,
  onSelect,
  onCollapse,
  onClose,
  onNavigate,
  className,
}: {
  active: FolderFilter;
  allTotal?: number;
  onSelect: (folder: FolderFilter) => void;
  onCollapse?: () => void;
  /** Mobile-only: close the Sheet from inside the panel. */
  onClose?: () => void;
  /** Closes the mobile Sheet after a scope is chosen. */
  onNavigate?: () => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const folders = useFetch<FolderListResponse>("/api/folders");
  const [foldersOpen, setFoldersOpen] = useLocalFlag(FOLDERS_OPEN_KEY, true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [renameTarget, setRenameTarget] = useState<PageIndexFolder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PageIndexFolder | null>(null);

  const list = folders.data?.folders ?? [];
  const select = (next: FolderFilter) => {
    onSelect(next);
    onNavigate?.();
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["pageindex"] });

  const createFolder = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreateError(null);
    setCreatingBusy(true);
    try {
      await apiSend("/api/folders", "POST", {
        name: trimmed,
        ...(active !== "all" && active !== "root" ? { parentFolderId: active } : {}),
      });
      setName("");
      setCreating(false);
      toast.success(`Created “${trimmed}”`);
      await invalidate();
    } catch (error) {
      setCreateError(
        error instanceof ApiError ? error.message : "Could not create folder",
      );
    } finally {
      setCreatingBusy(false);
    }
  };

  const closeCreate = () => {
    if (creatingBusy) return;
    setCreating(false);
    setName("");
    setCreateError(null);
  };

  const folderRemoved = (folder: PageIndexFolder) => {
    const removed = new Set([folder.id, ...descendantIds(list, folder.id)]);
    if (removed.has(active)) select("all");
    setDeleteTarget(null);
    void invalidate();
  };

  return (
    <aside
      aria-label="Workspaces"
      className={cn("flex min-h-0 flex-col bg-surface/50", className)}
    >
      <div className="shrink-0 px-2 pt-3">
        <div className="flex items-center gap-1 pb-2">
          <button
            type="button"
            onClick={() => setFoldersOpen(!foldersOpen)}
            aria-expanded={foldersOpen}
            className="flex min-w-0 flex-1 cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted transition-colors hover:text-ink"
          >
            <span>Workspaces</span>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                !foldersOpen && "-rotate-90",
              )}
              aria-hidden
            />
          </button>

          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse workspaces"
              title="Collapse workspaces"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <PanelLeftClose className="size-3.5" aria-hidden />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close workspaces"
              title="Close"
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          )}
        </div>

        <ScopeRow
          active={active === "all"}
          label="All documents"
          count={allTotal}
          icon={LayoutGrid}
          onClick={() => select("all")}
        />
        <ScopeRow
          active={active === "root"}
          label="Unfiled"
          icon={Inbox}
          onClick={() => select("root")}
          title="Documents that are not in any folder"
        />

        {creating ? (
          <div className="mt-1 px-1">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void createFolder();
                if (event.key === "Escape") closeCreate();
              }}
              placeholder="Folder name"
              aria-label="Folder name"
              maxLength={200}
              disabled={creatingBusy}
            />
            {createError && (
              <p className="mt-1 text-[11px] leading-snug text-red-700">
                {createError}
              </p>
            )}
            <div className="mt-1.5 flex gap-1">
              <Button
                type="button"
                size="sm"
                onClick={() => void createFolder()}
                disabled={creatingBusy || !name.trim()}
              >
                {creatingBusy && <Spinner className="size-3" />}
                {creatingBusy ? "Creating…" : "Create"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={closeCreate}
                disabled={creatingBusy}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <FolderPlus className="size-3.5 shrink-0 opacity-70" aria-hidden />
            New folder
          </button>
        )}
      </div>

      {foldersOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
          {folders.loading && !folders.data ? (
            <FolderSkeleton />
          ) : folders.error ? (
            <ErrorPanel error={folders.error} onRetry={folders.reload} compact />
          ) : list.length === 0 ? (
            <p className="px-2 py-2 text-[11.5px] leading-relaxed text-ink-muted">
              No folders yet.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {list.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  active={active === folder.id}
                  onSelect={() => select(folder.id)}
                  onRename={() => setRenameTarget(folder)}
                  onDelete={() => setDeleteTarget(folder)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div className="shrink-0 border-t border-line px-3 py-3 text-[10px] leading-relaxed text-ink-muted/80">
        PageIndex Cloud indexes documents into hierarchical trees, then answers
        questions with page- and block-level citations.
      </div>

      {renameTarget && (
        <RenameFolderDialog
          key={renameTarget.id}
          folder={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={() => {
            setRenameTarget(null);
            void invalidate();
          }}
        />
      )}
      {deleteTarget && (
        <DeleteFolderDialog
          key={deleteTarget.id}
          folder={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => folderRemoved(deleteTarget)}
        />
      )}
    </aside>
  );
}

/** The collapsed desktop rail: expand, all documents, unfiled. */
export function WorkspacesRail({
  active,
  onSelect,
  onExpand,
  className,
}: {
  active: FolderFilter;
  onSelect: (folder: FolderFilter) => void;
  onExpand: () => void;
  className?: string;
}) {
  return (
    <aside
      aria-label="Workspaces (collapsed)"
      className={cn(
        "flex w-12 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface/50 py-3",
        className,
      )}
    >
      <RailButton label="Expand workspaces" onClick={onExpand}>
        <PanelLeftOpen />
      </RailButton>
      <div className="my-1 h-px w-6 bg-line" aria-hidden />
      <RailButton
        label="All documents"
        active={active === "all"}
        onClick={() => onSelect("all")}
      >
        <LayoutGrid />
      </RailButton>
      <RailButton
        label="Unfiled"
        active={active === "root"}
        onClick={() => onSelect("root")}
      >
        <Inbox />
      </RailButton>
    </aside>
  );
}

/** Below `lg` the same panel arrives as a left Sheet. */
export function WorkspacesDrawer({
  open,
  onOpenChange,
  active,
  allTotal,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: FolderFilter;
  allTotal?: number;
  onSelect: (folder: FolderFilter) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[min(92vw,20rem)] gap-0 p-0"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Workspaces</SheetTitle>
          <SheetDescription>Filter the library by workspace folder.</SheetDescription>
        </SheetHeader>
        <WorkspacesPanel
          active={active}
          allTotal={allTotal}
          onSelect={onSelect}
          onClose={() => onOpenChange(false)}
          onNavigate={() => onOpenChange(false)}
          className="h-full w-full"
        />
      </SheetContent>
    </Sheet>
  );
}

function ScopeRow({
  active,
  label,
  count,
  icon: Icon,
  onClick,
  title,
}: {
  active: boolean;
  label: string;
  count?: number;
  icon: typeof LayoutGrid;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
        active
          ? "bg-brand-soft text-brand-deep"
          : "text-ink-muted hover:bg-ink/5 hover:text-ink",
      )}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
      <span className="truncate">{label}</span>
      {typeof count === "number" && (
        <span className="ml-auto shrink-0 font-mono text-[10px] opacity-60">
          {count}
        </span>
      )}
    </button>
  );
}

function FolderRow({
  folder,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  folder: PageIndexFolder;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "group/folder flex items-center rounded-lg transition-colors",
        active
          ? "bg-brand-soft text-brand-deep"
          : "text-ink-muted hover:bg-ink/5 hover:text-ink",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Open ${folder.name}`}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px]"
      >
        <Folder className="size-3.5 shrink-0 opacity-70" aria-hidden />
        <span className="truncate">{folder.name}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] opacity-60">
          {folder.file_count}
        </span>
      </button>

      <div className="pr-1 opacity-100 transition-opacity lg:opacity-0 lg:group-focus-within/folder:opacity-100 lg:group-hover/folder:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={`Actions for ${folder.name}`}
                className="grid size-6 cursor-pointer place-items-center rounded-md text-ink-muted outline-none transition-colors hover:bg-paper hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30"
              />
            }
          >
            <Ellipsis className="size-3.5" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
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
      </div>
    </div>
  );
}

function FolderSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-1 py-1" aria-busy aria-label="Loading folders">
      {["w-3/4", "w-1/2", "w-2/3", "w-2/5"].map((width) => (
        <div key={width} className="flex h-8 items-center gap-2 px-1">
          <Skeleton className="size-3.5 shrink-0 rounded" />
          <Skeleton className={cn("h-3", width)} />
        </div>
      ))}
    </div>
  );
}

function RailButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className={cn(
              "grid size-8 cursor-pointer place-items-center rounded-lg transition-colors [&_svg]:size-4",
              active
                ? "bg-brand-soft text-brand-deep"
                : "text-ink-muted hover:bg-ink/5 hover:text-ink",
            )}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function RenameFolderDialog({
  folder,
  onClose,
  onRenamed,
}: {
  folder: PageIndexFolder;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const [name, setName] = useState(folder.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = name.trim();

  const save = async () => {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/folders/${encodeURIComponent(folder.id)}`, "PATCH", {
        name: next,
      });
      toast.success("Folder renamed");
      onRenamed();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not rename the folder");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Rename folder</DialogTitle>
          <DialogDescription>
            Give this workspace folder a clearer name.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="flex flex-col gap-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label="Folder name"
            maxLength={200}
            disabled={busy}
          />
          {error && <p className="text-[12px] leading-snug text-red-700">{error}</p>}
          <DialogFooter>
            <DialogClose
              render={<Button type="button" variant="outline" disabled={busy} />}
            >
              Cancel
            </DialogClose>
            <Button type="submit" disabled={busy || !next}>
              {busy && <Spinner className="size-3" />}
              {busy ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteFolderDialog({
  folder,
  onClose,
  onDeleted,
}: {
  folder: PageIndexFolder;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/folders/${encodeURIComponent(folder.id)}`, "DELETE");
      toast.success("Folder deleted");
      onDeleted();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not delete the folder");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{folder.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Documents in this folder move to Unfiled, and nested folders are removed.
            The documents themselves are not deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-[12px] leading-snug text-red-700">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy && <Spinner className="size-3" />}
            {busy ? "Deleting…" : "Delete folder"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Every nested folder under `rootId`; the delete cascades through them. */
function descendantIds(list: PageIndexFolder[], rootId: string): string[] {
  const children = new Map<string, string[]>();
  for (const folder of list) {
    if (!folder.parent_folder_id) continue;
    const siblings = children.get(folder.parent_folder_id) ?? [];
    siblings.push(folder.id);
    children.set(folder.parent_folder_id, siblings);
  }

  const found: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    for (const child of children.get(id) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      found.push(child);
      stack.push(child);
    }
  }

  return found;
}

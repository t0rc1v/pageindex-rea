"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { FolderTree, PanelLeftOpen, Plus } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { ApiError, apiSend, apiUploadWithProgress } from "@/lib/client/api";
import { useFetch, useLocalFlag } from "@/lib/client/hooks";
import { summarizeEntries, type UploadResult } from "@/lib/client/upload";
import { formatRelative, initials, isPending } from "@/lib/format";
import type {
  DocumentListResponse,
  PageIndexDocument,
} from "@/lib/pageindex/types";
import { toast } from "sonner";

import {
  WorkspacesDrawer,
  WorkspacesPanel,
  WorkspacesRail,
  type FolderFilter,
} from "@/components/library/workspaces-panel";
import { useConfirm } from "@/components/ui/confirm";
import {
  Button,
  EmptyState,
  ErrorPanel,
  Panel,
  Skeleton,
  Spinner,
  StatusBadge,
  cn,
} from "./ui-kit";

const noPendingDocuments = (data: DocumentListResponse) =>
  !data.documents.some((doc) => isPending(doc.status));

export function LibraryView() {
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [view, setView] = useLocalFlag("pageindex-reader/library-view", false);
  const [folder, setFolder] = useState<FolderFilter>("all");
  const [workspacesOpen, setWorkspacesOpen] = useLocalFlag(
    "pageindex-reader/library/workspaces-open",
    true,
  );
  const [workspacesDrawerOpen, setWorkspacesDrawerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingUploads, setPendingUploads] = useState<
    Array<{
      id: string;
      name: string;
      state: "uploading" | "queued" | "error";
      message?: string;
      progress?: number;
    }>
  >([]);
  const [renaming, setRenaming] = useState<PageIndexDocument | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const config = useFetch<{ configured: boolean; apiUrl: string }>("/api/config");
  // The filtered query below cannot count the whole library, so the unfiltered
  // total (and the workspace folder counts) come from this one-row probe.
  const allDocs = useFetch<DocumentListResponse>("/api/docs?limit=1", {
    staleTime: 60_000,
  });

  const folderQuery = folder === "all" ? "" : `&folderId=${encodeURIComponent(folder)}`;
  const docs = useFetch<DocumentListResponse>(`/api/docs?limit=200${folderQuery}`, {
    refreshMs: 4000,
    stopWhen: noPendingDocuments,
  });

  const documents = useMemo(() => docs.data?.documents ?? [], [docs.data]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return documents;
    return documents.filter(
      (doc) =>
        doc.name.toLowerCase().includes(needle) ||
        (doc.description ?? "").toLowerCase().includes(needle),
    );
  }, [documents, query]);

  const upload = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const id = `${file.name}-${Math.random().toString(36).slice(2, 7)}`;
        setPendingUploads((current) => [
          ...current,
          { id, name: file.name, state: "uploading" },
        ]);

        const form = new FormData();
        form.set("file", file);
        if (folder !== "all" && folder !== "root") form.set("folder_id", folder);

        try {
          const result = await apiUploadWithProgress<UploadResult>(form, (fraction) => {
            setPendingUploads((current) =>
              current.map((item) =>
                item.id === id ? { ...item, progress: Math.round(fraction * 100) } : item,
              ),
            );
          });
          const bundle = summarizeEntries(result);
          if (bundle.total > 0) {
            if (bundle.failed > 0) {
              toast.warning(
                `${file.name}: ${bundle.ok} of ${bundle.total} files queued, ${bundle.failed} failed`,
              );
            } else {
              toast.success(`${file.name}: ${bundle.total} files queued for indexing`);
            }
          }
          setPendingUploads((current) =>
            current.map((item) =>
              item.id === id ? { ...item, state: "queued", progress: 100 } : item,
            ),
          );
          docs.reload();
          allDocs.reload();
          void queryClient.invalidateQueries({ queryKey: ["pageindex", "/api/folders"] });
          window.setTimeout(() => {
            setPendingUploads((current) => current.filter((item) => item.id !== id));
          }, 6000);
        } catch (error) {
          const message =
            error instanceof ApiError ? error.message : "Upload failed";
          setPendingUploads((current) =>
            current.map((item) =>
              item.id === id ? { ...item, state: "error", message } : item,
            ),
          );
        }
      }
    },
    [allDocs, docs, folder, queryClient],
  );

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) void upload(files);
  };

  const remove = async (doc: PageIndexDocument) => {
    const ok = await confirm({
      title: `Delete “${doc.name}”?`,
      description: "The document and its tree index are removed from PageIndex Cloud. This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(doc.id);
    try {
      await apiSend(`/api/docs/${encodeURIComponent(doc.id)}`, "DELETE");
      setSelected((current) => {
        const next = new Set(current);
        next.delete(doc.id);
        return next;
      });
      docs.reload();
      allDocs.reload();
      void queryClient.invalidateQueries({ queryKey: ["pageindex", "/api/folders"] });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedDocs = documents.filter((doc) => selected.has(doc.id));
  const busy = pendingUploads.some((item) => item.state === "uploading");

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const files = Array.from(event.dataTransfer.files).filter((file) =>
          /\.(pdf|docx?|pptx?|csv|md|markdown|txt|zip)$/i.test(file.name),
        );
        if (files.length > 0) void upload(files);
      }}
    >
      <header className="shrink-0 border-b border-line px-3 py-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="font-serif text-xl leading-tight text-ink">Library</h1>
            <p className="truncate text-[11px] text-ink-muted">
              {allDocs.data
                ? `${allDocs.data.total} ${allDocs.data.total === 1 ? "document" : "documents"}`
                : "Documents indexed by PageIndex Cloud"}
              {folder !== "all" && docs.data ? ` · ${docs.data.total} in view` : ""}
            </p>
          </div>

          <label className="relative order-last w-full sm:order-none sm:w-48 md:w-40 lg:w-44 xl:w-56">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter documents…"
              aria-label="Filter documents"
              className="h-9 w-full rounded-xl border border-line bg-surface pl-8 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-ink/30"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
              ⌕
            </span>
          </label>

          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="md"
              className="px-2.5 lg:hidden"
              onClick={() => setWorkspacesDrawerOpen(true)}
              aria-label="Open workspaces"
              title="Workspaces"
            >
              <FolderTree className="size-4" aria-hidden />
              <span className="hidden sm:inline md:hidden">Workspaces</span>
            </Button>

            {!workspacesOpen && (
              <Button
                variant="secondary"
                size="md"
                className="hidden px-2.5 lg:inline-flex"
                onClick={() => setWorkspacesOpen(true)}
                aria-label="Show workspaces"
                title="Show workspaces"
              >
                <PanelLeftOpen className="size-4" aria-hidden />
                <span className="hidden xl:inline">Workspaces</span>
              </Button>
            )}

            <div className="flex items-center rounded-xl border border-line bg-surface p-0.5">
              {([
                { key: false, label: "Grid view", icon: "▦" },
                { key: true, label: "List view", icon: "☰" },
              ] as const).map((option) => (
                <button
                  key={String(option.key)}
                  type="button"
                  onClick={() => setView(option.key)}
                  aria-pressed={view === option.key}
                  aria-label={option.label}
                  title={option.label}
                  className={cn(
                    "grid size-7 cursor-pointer place-items-center rounded-lg text-[12px] transition-colors",
                    view === option.key
                      ? "bg-ink text-paper"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {option.icon}
                </button>
              ))}
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.docx,.doc,.pptx,.ppt,.csv,.md,.markdown,.txt,.zip"
              multiple
              onChange={onPick}
              className="hidden"
            />
            <Button
              variant="primary"
              size="md"
              className="px-2.5 sm:px-3"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              aria-label="Add document"
            >
              {busy ? <Spinner className="size-3.5" /> : <Plus className="size-4" aria-hidden />}
              <span className="hidden sm:inline md:hidden lg:inline">Add document</span>
            </Button>
          </div>
        </div>
      </header>

      {config.data && !config.data.configured && (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-[12px] leading-relaxed text-amber-900">
          <strong className="font-medium">No API key configured.</strong> Add{" "}
          <code className="rounded bg-white/70 px-1 font-mono">PAGEINDEX_API_KEY</code>{" "}
          to <code className="font-mono">.env.local</code> and restart the dev
          server. Get a key from{" "}
          <a
            href="https://dash.pageindex.ai"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            dash.pageindex.ai
          </a>
          .
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="hidden min-h-0 shrink-0 lg:flex">
          {workspacesOpen ? (
            <WorkspacesPanel
              active={folder}
              allTotal={allDocs.data?.total}
              onSelect={setFolder}
              onCollapse={() => setWorkspacesOpen(false)}
              className="w-56 border-r border-line"
            />
          ) : (
            <WorkspacesRail
              active={folder}
              onSelect={setFolder}
              onExpand={() => setWorkspacesOpen(true)}
            />
          )}
        </div>

        <section className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4 sm:py-4">
          {pendingUploads.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {pendingUploads.map((item) => (
                <li
                  key={item.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px]",
                    item.state === "error"
                      ? "border-red-200 bg-red-50 text-red-900"
                      : "border-line bg-surface text-ink-muted",
                  )}
                >
                  {item.state === "uploading" && <Spinner className="size-3" />}
                  {item.state === "queued" && <span className="text-emerald-600">✓</span>}
                  {item.state === "error" && <span>!</span>}
                  <span className="truncate text-ink">{item.name}</span>
                  <span className="truncate">
                    {item.state === "uploading"
                      ? item.progress !== undefined
                        ? `uploading ${item.progress}%`
                        : "uploading…"
                      : item.state === "queued"
                        ? "submitted — indexing in the background"
                        : item.message}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/15 bg-ink px-3 py-2 text-paper">
              <p className="text-[12px]">
                {selected.size} selected
                <span className="ml-2 opacity-60">
                  {selectedDocs.map((doc) => doc.name).join(", ").slice(0, 80)}
                </span>
              </p>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelected(new Set())}
                >
                  Clear
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  className="!bg-paper !text-ink !border-paper"
                  onClick={() =>
                    router.push(
                      `/chat?docs=${encodeURIComponent(
                        Array.from(selected).join(","),
                      )}`,
                    )
                  }
                >
                  Ask these documents
                </Button>
              </div>
            </div>
          )}

          {docs.error ? (
            <ErrorPanel error={docs.error} onRetry={docs.reload} />
          ) : docs.loading && !docs.data ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Panel key={index} className="p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-full" />
                  <Skeleton className="mt-1.5 h-3 w-4/5" />
                </Panel>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={query ? "No matches" : "Your library is empty"}
              description={
                query
                  ? "No document name or description matches that filter."
                  : "Upload PDFs, Word, PowerPoint, spreadsheets, Markdown or a ZIP of a whole folder. PageIndex parses it, OCRs it, and builds the tree index the reader navigates."
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setQuery("")}>
                    Clear filter
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => inputRef.current?.click()}>
                    Add your first document
                  </Button>
                )
              }
            />
          ) : (
            <ul
              className={cn(
                view
                  ? "flex flex-col gap-1.5"
                  : "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3",
              )}
            >
              {filtered.map((doc) => (
                <li key={doc.id}>
                  <DocumentCard
                    doc={doc}
                    view={view ? "list" : "grid"}
                    selected={selected.has(doc.id)}
                    onToggle={() => toggleSelected(doc.id)}
                    onRename={() => setRenaming(doc)}
                    onDelete={() => void remove(doc)}
                    deleting={deleting === doc.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <WorkspacesDrawer
        open={workspacesDrawerOpen}
        onOpenChange={setWorkspacesDrawerOpen}
        active={folder}
        allTotal={allDocs.data?.total}
        onSelect={setFolder}
      />

      {renaming && (
        <RenameDialog
          doc={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => {
            setRenaming(null);
            docs.reload();
          }}
        />
      )}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-ink/40 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-paper/80 px-10 py-8 text-center text-paper">
            <p className="font-serif text-xl">Drop documents to index</p>
            <p className="mt-1 text-[12px] opacity-80">
              They upload to your PageIndex Cloud account
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentCard({
  doc,
  view,
  selected,
  onToggle,
  onRename,
  onDelete,
  deleting,
}: {
  doc: PageIndexDocument;
  view: "grid" | "list";
  selected: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const ready = doc.status === "completed";

  if (view === "list") {
    return (
      <div
        className={cn(
          "group flex items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 transition-colors",
          selected ? "border-brand/50 ring-1 ring-brand/30" : "hover:border-ink/20",
        )}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={selected ? "Deselect document" : "Select document"}
          className={cn(
            "grid size-4 shrink-0 cursor-pointer place-items-center rounded-[4px] border text-[9px]",
            selected ? "border-brand bg-brand text-white" : "border-line text-transparent",
          )}
        >
          ✓
        </button>
        <span className="grid size-6 shrink-0 place-items-center rounded border border-line bg-paper font-mono text-[9px] text-ink-muted">
          {initials(doc.name)}
        </span>
        <Link
          href={ready ? `/doc/${encodeURIComponent(doc.id)}` : "#"}
          className={cn("min-w-0 flex-1 truncate text-[12.5px] text-ink", !ready && "pointer-events-none opacity-70")}
          title={doc.name}
        >
          {doc.name}
        </Link>
        <span className="hidden shrink-0 font-mono text-[10px] text-ink-muted/80 sm:block">
          {doc.pageNum ? `${doc.pageNum}p · ` : ""}
          {formatRelative(doc.createdAt)}
        </span>
        <StatusBadge status={doc.status} />
        <button
          type="button"
          onClick={onRename}
          aria-label="Rename document"
          title="Rename"
          className="grid size-6 cursor-pointer place-items-center rounded-md text-ink-muted opacity-0 transition-opacity hover:bg-paper hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100 group-hover:opacity-100"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete document"
          className="grid size-6 cursor-pointer place-items-center rounded-md text-ink-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 pointer-coarse:opacity-100 disabled:opacity-40 group-hover:opacity-100"
        >
          {deleting ? <Spinner className="size-3" /> : "✕"}
        </button>
      </div>
    );
  }

  return (
    <Panel
      className={cn(
        "group relative flex h-full flex-col gap-2 p-4 transition-colors",
        selected ? "border-brand/50 ring-1 ring-brand/30" : "hover:border-ink/20",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={ready ? `/doc/${encodeURIComponent(doc.id)}` : "#"}
          className={cn(
            "min-w-0 flex-1",
            !ready && "pointer-events-none opacity-70",
          )}
        >
          <div className="flex items-center gap-2">
            <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-paper font-mono text-[10px] text-ink-muted">
              {initials(doc.name)}
            </span>
            <h2 className="line-clamp-2 font-serif text-[15px] leading-snug text-ink">
              {doc.name}
            </h2>
          </div>
        </Link>
        <button
          type="button"
          onClick={onToggle}
          aria-label={selected ? "Deselect document" : "Select document"}
          className={cn(
            "mt-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded-[5px] border text-[10px] transition-opacity",
            selected
              ? "border-brand bg-brand text-white opacity-100"
              : "border-line bg-surface text-transparent opacity-0 pointer-coarse:opacity-100 group-hover:opacity-100",
          )}
        >
          ✓
        </button>
      </div>

      {doc.description && (
        <p className="line-clamp-2 text-[12px] leading-relaxed text-ink-muted">
          {doc.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="truncate font-mono text-[10px] text-ink-muted/80">
          {doc.pageNum ? `${doc.pageNum}p · ` : ""}
          {formatRelative(doc.createdAt)}
          {doc.path ? ` · ${doc.path}` : ""}
        </span>
        <div className="flex items-center gap-1">
          <StatusBadge status={doc.status} />
          <button
            type="button"
            onClick={onRename}
            aria-label="Rename document"
            title="Rename"
            className="grid size-6 cursor-pointer place-items-center rounded-md text-ink-muted opacity-0 transition-opacity hover:bg-paper hover:text-ink focus-visible:opacity-100 pointer-coarse:opacity-100 group-hover:opacity-100"
          >
            ✎
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            aria-label="Delete document"
            className="grid size-6 cursor-pointer place-items-center rounded-md text-ink-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-700 focus-visible:opacity-100 pointer-coarse:opacity-100 disabled:opacity-40 group-hover:opacity-100"
          >
            {deleting ? <Spinner className="size-3" /> : "✕"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

/** Rename / re-describe a document (one PATCH over the documented metadata API). */
function RenameDialog({
  doc,
  onClose,
  onSaved,
}: {
  doc: PageIndexDocument;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(doc.name);
  const [description, setDescription] = useState(doc.description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = name.trim();
    if (!next) return;
    setSaving(true);
    try {
      await apiSend(`/api/docs/${encodeURIComponent(doc.id)}`, "PATCH", {
        name: next,
        description: description.trim() || null,
      });
      toast.success("Document updated");
      onSaved();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not update the document");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rename document"
        className="pi-enter w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
      >
        <div className="border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-medium text-ink">Document details</h2>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            Rename the file or rewrite the summary the model reads.
          </p>
        </div>
        <div className="flex flex-col gap-3 px-4 py-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              className="h-9 rounded-lg border border-line bg-paper px-2.5 text-[13px] text-ink outline-none focus:border-ink/30"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">
              Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="resize-none rounded-lg border border-line bg-paper px-2.5 py-2 text-[12.5px] leading-relaxed text-ink outline-none focus:border-ink/30"
              placeholder="One line the library and the model can use."
            />
          </label>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-line bg-paper/60 px-3 py-2.5">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={() => void save()} disabled={saving || !name.trim()}>
            {saving ? <Spinner className="size-3" /> : null} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { ApiError, apiSend, apiUpload } from "@/lib/client/api";
import { useFetch } from "@/lib/client/hooks";
import { formatRelative, initials, isPending } from "@/lib/format";
import type {
  DocumentListResponse,
  FolderListResponse,
  PageIndexDocument,
} from "@/lib/pageindex/types";
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

type FolderFilter = "all" | "root" | string;

const noPendingDocuments = (data: DocumentListResponse) =>
  !data.documents.some((doc) => isPending(doc.status));

export function LibraryView() {
  const router = useRouter();
  const [folder, setFolder] = useState<FolderFilter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingUploads, setPendingUploads] = useState<
    Array<{ id: string; name: string; state: "uploading" | "queued" | "error"; message?: string }>
  >([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const config = useFetch<{ configured: boolean; apiUrl: string }>("/api/config");

  const folderQuery = folder === "all" ? "" : `&folderId=${encodeURIComponent(folder)}`;
  const docs = useFetch<DocumentListResponse>(`/api/docs?limit=200${folderQuery}`, {
    refreshMs: 4000,
    stopWhen: noPendingDocuments,
  });
  const folders = useFetch<FolderListResponse>("/api/folders");

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
          await apiUpload<{ doc_id: string }>(form);
          setPendingUploads((current) =>
            current.map((item) =>
              item.id === id ? { ...item, state: "queued" } : item,
            ),
          );
          docs.reload();
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
    [docs, folder],
  );

  const onPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) void upload(files);
  };

  const remove = async (doc: PageIndexDocument) => {
    if (!window.confirm(`Delete “${doc.name}” and its tree index?`)) return;
    setDeleting(doc.id);
    try {
      await apiSend(`/api/docs/${encodeURIComponent(doc.id)}`, "DELETE");
      setSelected((current) => {
        const next = new Set(current);
        next.delete(doc.id);
        return next;
      });
      docs.reload();
    } catch (error) {
      window.alert(error instanceof ApiError ? error.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  };

  const createFolder = async () => {
    const name = folderName.trim();
    if (!name) return;
    setFolderError(null);
    try {
      await apiSend("/api/folders", "POST", {
        name,
        ...(folder !== "all" && folder !== "root" ? { parentFolderId: folder } : {}),
      });
      setFolderName("");
      setCreatingFolder(false);
      folders.reload();
    } catch (error) {
      setFolderError(error instanceof ApiError ? error.message : "Could not create folder");
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
          file.name.toLowerCase().endsWith(".pdf"),
        );
        if (files.length > 0) void upload(files);
      }}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div>
          <h1 className="font-serif text-xl leading-tight text-ink">Library</h1>
          <p className="text-[11px] text-ink-muted">
            Documents indexed by PageIndex Cloud
            {docs.data ? ` · ${docs.data.total} total` : ""}
          </p>
        </div>

        <div className="flex flex-1 items-center justify-end gap-2">
          <label className="relative hidden sm:block">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter documents…"
              className="h-9 w-56 rounded-xl border border-line bg-surface pl-8 pr-3 text-[13px] text-ink outline-none placeholder:text-ink-muted/70 focus:border-ink/30"
            />
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted">
              ⌕
            </span>
          </label>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={onPick}
            className="hidden"
          />
          <Button
            variant="primary"
            size="md"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Spinner className="size-3.5" /> : "+"} Add PDF
          </Button>
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

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-line bg-surface/50 px-2 py-3 md:flex">
          <p className="px-2 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-ink-muted">
            Workspaces
          </p>
          <FolderRow
            active={folder === "all"}
            label="All documents"
            count={docs.data?.total}
            onClick={() => setFolder("all")}
          />
          <FolderRow
            active={folder === "root"}
            label="Unfiled"
            onClick={() => setFolder("root")}
          />
          {(folders.data?.folders ?? []).map((item) => (
            <FolderRow
              key={item.id}
              active={folder === item.id}
              label={item.name}
              count={item.file_count}
              onClick={() => setFolder(item.id)}
            />
          ))}

          {creatingFolder ? (
            <div className="mt-2 px-2">
              <input
                autoFocus
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void createFolder();
                  if (event.key === "Escape") setCreatingFolder(false);
                }}
                placeholder="Folder name"
                className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[12px] outline-none focus:border-ink/30"
              />
              {folderError && (
                <p className="mt-1 text-[11px] leading-snug text-red-700">{folderError}</p>
              )}
              <div className="mt-1.5 flex gap-1">
                <Button size="sm" variant="primary" onClick={() => void createFolder()}>
                  Create
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCreatingFolder(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              className="mt-2 cursor-pointer rounded-lg px-2 py-1.5 text-left text-[12px] text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
            >
              + New folder
            </button>
          )}

          <div className="mt-auto px-2 pt-4 text-[10px] leading-relaxed text-ink-muted/80">
            PageIndex Cloud indexes PDFs into hierarchical trees, then answers
            questions with page- and block-level citations.
          </div>
        </aside>

        <section className="min-h-0 overflow-y-auto px-4 py-4">
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
                      ? "uploading…"
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  : "Upload a PDF — reports, textbooks, legal filings, papers. PageIndex parses it, OCRs it, and builds the tree index the reader navigates."
              }
              action={
                query ? (
                  <Button variant="secondary" onClick={() => setQuery("")}>
                    Clear filter
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => inputRef.current?.click()}>
                    Add your first PDF
                  </Button>
                )
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((doc) => (
                <li key={doc.id}>
                  <DocumentCard
                    doc={doc}
                    selected={selected.has(doc.id)}
                    onToggle={() => toggleSelected(doc.id)}
                    onDelete={() => void remove(doc)}
                    deleting={deleting === doc.id}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-ink/40 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-paper/80 px-10 py-8 text-center text-paper">
            <p className="font-serif text-xl">Drop PDFs to index</p>
            <p className="mt-1 text-[12px] opacity-80">
              They upload to your PageIndex Cloud account
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderRow({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
        active ? "bg-brand-soft text-brand-deep" : "text-ink-muted hover:bg-ink/5 hover:text-ink",
      )}
    >
      <span className="truncate">{label}</span>
      {typeof count === "number" && (
        <span className="shrink-0 font-mono text-[10px] opacity-60">{count}</span>
      )}
    </button>
  );
}

function DocumentCard({
  doc,
  selected,
  onToggle,
  onDelete,
  deleting,
}: {
  doc: PageIndexDocument;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const ready = doc.status === "completed";

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
              : "border-line bg-surface text-transparent opacity-0 group-hover:opacity-100",
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
            onClick={onDelete}
            disabled={deleting}
            aria-label="Delete document"
            className="grid size-6 cursor-pointer place-items-center rounded-md text-ink-muted opacity-0 transition-opacity hover:bg-red-50 hover:text-red-700 disabled:opacity-40 group-hover:opacity-100"
          >
            {deleting ? <Spinner className="size-3" /> : "✕"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

"use client";

import { Check, FolderOpen, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import { isPending } from "@/lib/format";
import type { DocumentListResponse } from "@/lib/pageindex/types";
import { cn } from "@/components/ui-kit";

export interface PickedDoc {
  id: string;
  name: string;
}

/**
 * The composer's scope picker: a popover above the input, not a modal.
 *
 * The official app calls this "Select Documents" and treats an empty selection
 * as the whole library, which is exactly how the managed chat endpoint behaves
 * (no `doc_id` = retrieval across everything).
 */
export function DocPicker({
  selected,
  onApply,
  onClose,
}: {
  selected: PickedDoc[];
  onApply: (docs: PickedDoc[]) => void;
  onClose: () => void;
}) {
  const docs = useFetch<DocumentListResponse>("/api/docs?limit=200");
  const [picked, setPicked] = useState<Set<string>>(new Set(selected.map((doc) => doc.id)));
  const [query, setQuery] = useState("");

  const list = useMemo(() => {
    const available = (docs.data?.documents ?? []).filter(
      (doc) => !isPending(doc.status) && doc.status !== "failed",
    );
    const needle = query.trim().toLowerCase();
    return needle ? available.filter((doc) => doc.name.toLowerCase().includes(needle)) : available;
  }, [docs.data, query]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  return (
    <div className="absolute bottom-full left-0 z-40 mb-2 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-2xl">
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-2">
        <Search className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search documents…"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-ink-muted/70"
        />
      </div>

      <div className="max-h-64 overflow-y-auto p-1">
        {docs.loading ? (
          <p className="px-2 py-4 text-center text-[11.5px] text-ink-muted">Loading…</p>
        ) : list.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11.5px] text-ink-muted">
            {query ? "No matches." : "No indexed documents yet."}
          </p>
        ) : (
          list.map((doc) => {
            const isPicked = picked.has(doc.id);
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => toggle(doc.id)}
                className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-paper"
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded border",
                    isPicked ? "border-ink bg-ink text-paper" : "border-line",
                  )}
                  aria-hidden
                >
                  {isPicked && <Check className="size-3" />}
                </span>
                <FolderOpen className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-[12px] text-ink">{doc.name}</span>
                <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                  {doc.pageNum ? `${doc.pageNum}p` : ""}
                </span>
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1.5">
        <span className="text-[10.5px] text-ink-muted">
          {picked.size === 0 ? "Whole library" : `${picked.size} selected`}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-2 py-1 text-[11px] text-ink-muted hover:bg-paper hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              const all = docs.data?.documents ?? [];
              onApply(
                [...picked].map((id) => ({
                  id,
                  name: all.find((doc) => doc.id === id)?.name ?? id,
                })),
              );
              onClose();
            }}
            className="flex cursor-pointer items-center gap-1 rounded-md bg-ink px-2 py-1 text-[11px] text-paper"
          >
            <Plus className="size-3" aria-hidden />
            Select
          </button>
        </div>
      </div>
    </div>
  );
}

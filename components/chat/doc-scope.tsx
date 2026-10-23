"use client";

import { useMemo, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import { isPending } from "@/lib/format";
import type { DocumentListResponse } from "@/lib/pageindex/types";
import { Button, Spinner, cn } from "@/components/ui-kit";

/**
 * Scope picker: which documents the next answer may read.
 * An empty selection means the whole library, which is also how the managed
 * chat endpoint behaves when `doc_id` is omitted.
 */
export function DocScopeDialog({
  selected,
  onApply,
  onClose,
}: {
  selected: Array<{ id: string; name: string }>;
  onApply: (docs: Array<{ id: string; name: string }>) => void;
  onClose: () => void;
}) {
  const docs = useFetch<DocumentListResponse>("/api/docs?limit=200");
  const [picked, setPicked] = useState<Set<string>>(new Set(selected.map((doc) => doc.id)));
  const [query, setQuery] = useState("");

  const available = useMemo(() => {
    const list = (docs.data?.documents ?? []).filter(
      (doc) => !isPending(doc.status) && doc.status !== "failed",
    );
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((doc) => doc.name.toLowerCase().includes(needle));
  }, [docs.data, query]);

  const apply = () => {
    const list = docs.data?.documents ?? [];
    onApply(
      [...picked].map((id) => ({
        id,
        name: list.find((doc) => doc.id === id)?.name ?? id,
      })),
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <p className="font-serif text-[15px] text-ink">Documents in scope</p>
            <p className="text-[11px] text-ink-muted">
              {picked.size === 0
                ? "Nothing selected — PageIndex searches your whole library"
                : `${picked.size} selected`}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
            ✕
          </Button>
        </header>

        <div className="border-b border-line px-4 py-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter documents…"
            className="h-9 w-full rounded-lg border border-line bg-paper/60 px-2.5 text-[12.5px] outline-none focus:border-ink/30"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {docs.loading && !docs.data ? (
            <div className="flex items-center gap-2 px-2 py-4 text-[12px] text-ink-muted">
              <Spinner className="size-3" /> Loading documents…
            </div>
          ) : available.length === 0 ? (
            <p className="px-2 py-4 text-[12px] text-ink-muted">No indexed documents found.</p>
          ) : (
            <ul className="flex flex-col">
              {available.map((doc) => {
                const active = picked.has(doc.id);
                return (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (next.has(doc.id)) next.delete(doc.id);
                          else next.add(doc.id);
                          return next;
                        })
                      }
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                        active ? "bg-brand-soft" : "hover:bg-ink/5",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border text-[9px]",
                          active
                            ? "border-brand bg-brand text-white"
                            : "border-line bg-surface text-transparent",
                        )}
                      >
                        ✓
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 block text-[12.5px] leading-snug text-ink">
                          {doc.name}
                        </span>
                        <span className="font-mono text-[10px] text-ink-muted">
                          {doc.pageNum ? `${doc.pageNum}p` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
          <div className="flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={apply}>
              Use {picked.size === 0 ? "whole library" : `${picked.size} documents`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

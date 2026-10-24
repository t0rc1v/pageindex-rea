"use client";

import { ChevronDown, FileText } from "lucide-react";
import { useMemo, useState } from "react";

import type { Citation } from "@/lib/pageindex/types";
import { cn } from "@/components/ui-kit";
import type { CitationAnchor } from "./citation-card";

interface Group {
  key: string;
  document: string;
  docId?: string;
  pages: Array<{ page: number; citation: Citation }>;
}

function group(citations: Citation[]): Group[] {
  const groups = new Map<string, Group>();
  for (const citation of citations) {
    const key = citation.docId ?? citation.document;
    let entry = groups.get(key);
    if (!entry) {
      entry = { key, document: citation.document, docId: citation.docId, pages: [] };
      groups.set(key, entry);
    }
    if (!entry.pages.some((item) => item.page === citation.page)) {
      entry.pages.push({ page: citation.page, citation });
    }
  }
  for (const entry of groups.values()) {
    entry.pages.sort((a, b) => a.page - b.page);
  }
  return [...groups.values()];
}

/**
 * The answer's Sources block: a hairline row that expands into the documents
 * behind the citations, each with its cited pages.
 *
 * Collapsed by default, and self-contained — a single document with a single
 * page still renders as a row so the answer never sprouts a second layout.
 */
export function Sources({
  citations,
  onPreview,
  onOpenPage,
}: {
  citations: Citation[];
  onPreview: (citation: Citation, rect: CitationAnchor["rect"], marker: HTMLElement) => void;
  onOpenPage: (citation: Citation) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => group(citations), [citations]);
  const references = citations.length;
  const documents = groups.length;

  if (references === 0) return null;

  return (
    <div className="mt-4 border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 py-2 text-left"
      >
        <span className="text-[13px] font-medium text-ink">Sources</span>
        <span className="text-[11.5px] text-ink-muted">
          {references} reference{references === 1 ? "" : "s"} · {documents}{" "}
          document{documents === 1 ? "" : "s"}
        </span>
        <span className="h-px min-w-4 flex-1 bg-line" aria-hidden />
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <ol className="mb-3 flex flex-col gap-1.5">
          {groups.map((entry, index) => (
            <li
              key={entry.key}
              className="flex items-start gap-2 rounded-lg px-1 py-1 text-[12.5px] hover:bg-paper/70"
            >
              <span className="mt-0.5 w-4 shrink-0 font-mono text-[10px] text-ink-muted">
                {index + 1}.
              </span>
              <FileText className="mt-0.5 size-3.5 shrink-0 text-ink-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <button
                  type="button"
                  disabled={!entry.docId}
                  onClick={() => {
                    const first = entry.pages[0];
                    if (first) onOpenPage(first.citation);
                  }}
                  className="max-w-full cursor-pointer truncate text-left text-ink hover:underline disabled:cursor-default disabled:no-underline"
                  title={entry.document}
                >
                  {entry.document}
                </button>
                <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
                  {entry.pages.map((item) => (
                    <button
                      key={item.page}
                      type="button"
                      onClick={(event) => {
                        if (!item.citation.docId) return;
                        const rect = event.currentTarget.getBoundingClientRect();
                        onPreview(
                          item.citation,
                          { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                          event.currentTarget,
                        );
                      }}
                      className="cursor-pointer rounded px-1 py-0.5 font-mono text-[10.5px] text-brand-deep underline decoration-brand/40 underline-offset-2 hover:decoration-brand disabled:cursor-default disabled:opacity-60"
                      title={`${entry.document} — page ${item.page}`}
                    >
                      p.{item.page}
                    </button>
                  ))}
                </span>
              </span>
              <span className="shrink-0 self-center font-mono text-[10px] text-ink-muted">
                {entry.pages.length} ref{entry.pages.length === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

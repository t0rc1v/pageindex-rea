"use client";

import {
  BookOpen,
  ChevronDown,
  FileSearch,
  FileText,
  FolderTree,
  Image as ImageIcon,
  ListTree,
  Search,
  SlidersHorizontal,
  Terminal,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useFetch } from "@/lib/client/hooks";
import type { StoredTool } from "@/lib/chat-store";
import type { TreeResponse, TreeNode } from "@/lib/pageindex/types";
import { cn } from "@/components/ui-kit";
import { JsonBlock } from "./json-view";

/** The catalogue of tool activity, phrased the way the model's steps read. */
const TOOLS: Record<
  string,
  { label: string; noun: string; icon: typeof Search }
> = {
  find_relevant_documents: { label: "Searched the library", noun: "documents", icon: Search },
  find_relevant_document: { label: "Searched the library", noun: "document", icon: Search },
  browse_documents: { label: "Browsed documents", noun: "documents", icon: FileSearch },
  search_documents: { label: "Searched documents", noun: "documents", icon: Search },
  get_document_structure: { label: "Read the document structure", noun: "structure", icon: ListTree },
  get_page_content: { label: "Read pages", noun: "pages", icon: BookOpen },
  get_document_image: { label: "Fetched a figure", noun: "figure", icon: ImageIcon },
  get_document: { label: "Opened the document", noun: "document", icon: FileText },
  get_folder_structure: { label: "Viewed folder structure", noun: "folders", icon: FolderTree },
  get_document_metadata: { label: "Queried document metadata", noun: "metadata", icon: SlidersHorizontal },
};

function meta(name: string) {
  return (
    TOOLS[name] ?? {
      label: name.replace(/[_-]+/g, " "),
      noun: "result",
      icon: Terminal,
    }
  );
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** `"3-5"`, `"3,7"` or `3` → the page span the step asked for. */
function pageSpan(value: unknown): { from: number; to: number; label: string } | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return { from: value, to: value, label: String(value) };
  }
  const text = str(value);
  if (!text) return null;
  const range = text.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    return from && to ? { from, to, label: `${from}–${to}` } : null;
  }
  const single = text.match(/^(\d+)$/);
  if (single) {
    const page = Number(single[1]);
    return page ? { from: page, to: page, label: String(page) } : null;
  }
  return null;
}

export function toolSentence(tool: StoredTool): string {
  const { label } = meta(tool.name);
  const args = record(tool.args);
  const doc = str(args.doc_name) ?? str(args.document) ?? str(args.doc);
  const span = pageSpan(args.pages ?? args.page_numbers ?? args.page);

  if (tool.name === "get_page_content" && span) {
    return doc ? `${label} ${span.label} from “${doc}”` : `${label} ${span.label}`;
  }
  if (tool.name === "get_document_structure" && doc) {
    return `${label} of “${doc}”`;
  }
  const query = str(args.query) ?? str(args.q);
  if (query) return `${label}: “${query}”`;
  if (doc) return `${label} of “${doc}”`;
  return label;
}

/** Flatten the PageIndex tree into title/page rows. */
function outline(nodes: TreeNode[] | undefined, depth = 0): Array<{ title: string; page: number; depth: number }> {
  if (!nodes?.length) return [];
  const rows: Array<{ title: string; page: number; depth: number }> = [];
  for (const node of nodes) {
    rows.push({ title: node.title, page: node.page_index, depth });
    rows.push(...outline(node.nodes, depth + 1));
  }
  return rows;
}

export function ToolStep({
  tool,
  docId,
  running,
}: {
  tool: StoredTool;
  /** Resolved document for this tool call, when the name matched the library. */
  docId?: string;
  running: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const { label, icon: Icon } = meta(tool.name);
  const args = record(tool.args);
  const span = pageSpan(args.pages ?? args.page_numbers ?? args.page);
  const wantsStructure = tool.name === "get_document_structure";
  const wantsPages = tool.name === "get_page_content" && Boolean(docId && span);
  const docName = str(args.doc_name) ?? str(args.document) ?? str(args.doc);

  const tree = useFetch<TreeResponse>(
    open && wantsStructure && docId ? `/api/docs/${encodeURIComponent(docId)}/tree` : null,
  );
  const pages = useFetch<{ pages: Array<{ page_index: number; markdown: string }>; pageCount?: number }>(
    open && wantsPages && docId && span
      ? `/api/docs/${encodeURIComponent(docId)}/pages?from=${span.from}&to=${span.to}`
      : null,
  );

  const rows = useMemo(() => outline(tree.data?.result).slice(0, 60), [tree.data]);
  const hasResult = tool.result !== undefined && tool.result !== null;

  return (
    <li className="group/tool">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1 text-left text-[13px] text-ink-muted transition-colors hover:text-ink"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className={cn("min-w-0 flex-1 truncate", running && "pi-shimmer")}>
          {toolSentence(tool)}
        </span>
        {tool.status === "error" && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-red-600">failed</span>
        )}
        <ChevronDown
          className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div className="mb-1 ml-6 overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5">
            <span className="min-w-0 truncate text-[11px] text-ink-muted">
              {docName ? `${docName}` : label}
              {wantsPages && span ? ` · returned pages ${span.label}` : ""}
            </span>
            <button
              type="button"
              onClick={() => setRaw(true)}
              aria-label="View raw input and output"
              title="View raw input and output"
              className="shrink-0 cursor-pointer rounded p-1 text-ink-muted transition-colors hover:bg-paper hover:text-ink"
            >
              <Terminal className="size-3.5" aria-hidden />
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto px-2.5 py-2">
            {rows.length > 0 ? (
              <ul className="flex flex-col">
                {rows.map((row, index) => (
                  <li
                    key={`${row.title}-${index}`}
                    className="flex items-baseline justify-between gap-3 rounded px-1 py-1 text-[12px] text-ink hover:bg-paper/70"
                    style={{ paddingLeft: `${4 + row.depth * 12}px` }}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <ListTree className="size-3 shrink-0 text-ink-muted" aria-hidden />
                      <span className="truncate">{row.title}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                      Page {row.page}
                    </span>
                  </li>
                ))}
              </ul>
            ) : pages.data?.pages?.length ? (
              <div className="flex flex-col gap-2">
                {pages.data.pages.map((page) => (
                  <div key={page.page_index}>
                    <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wide text-ink-muted">
                      Page {page.page_index}
                    </p>
                    <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-ink-muted">
                      {page.markdown.replace(/[#*`>]/g, "").slice(0, 600)}
                    </p>
                  </div>
                ))}
              </div>
            ) : hasResult ? (
              <div className="font-mono text-[11px] leading-relaxed">
                <JsonBlock title="Output" value={tool.result} />
              </div>
            ) : tree.loading || pages.loading ? (
              <div className="flex flex-col gap-1.5 py-1">
                <span className="h-2.5 w-2/3 animate-pulse rounded bg-line" />
                <span className="h-2.5 w-1/2 animate-pulse rounded bg-line" />
              </div>
            ) : (
              <p className="py-1 text-[11.5px] leading-relaxed text-ink-muted">
                This lane streams the call&apos;s arguments but not its payload. Open the raw
                view to inspect what the model sent.
              </p>
            )}
          </div>
        </div>
      )}

      {raw && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-line bg-surface shadow-2xl sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">Raw input and output</p>
                <p className="font-mono text-[10px] text-ink-muted">{tool.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setRaw(false)}
                aria-label="Close raw view"
                className="cursor-pointer rounded-md px-2 py-1 text-[12px] text-ink-muted hover:bg-paper hover:text-ink"
              >
                Close
              </button>
            </header>
            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 py-3">
              <JsonBlock title="Input" value={tool.args} />
              <JsonBlock title="Output" value={tool.result} />
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

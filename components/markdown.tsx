"use client";

import { useRef, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { citationKey, tokenizeCitations } from "@/lib/citations";
import { downloadFile } from "@/lib/chat-export";
import type { Citation } from "@/lib/pageindex/types";
import { CitationChip, type CitationPreviewHandler } from "./citation-chip";
import { cn } from "./ui-kit";

function isAbsoluteUrl(value: string): boolean {
  return /^(https?:|data:|blob:)/i.test(value);
}

const CITE_PREFIX = "#pi-cite-";

/**
 * OCR page content and answers are markdown. Three adjustments matter here:
 *  - citation tags are swapped for inline links (`#pi-cite-N`) and rendered back
 *    as numbered chips, with the same source reusing its number;
 *  - embedded figures come back as bare image ids (e.g. `img-7.jpeg`), routed
 *    through the API's presigned-image endpoint;
 *  - links open in a new tab so a click never navigates the reader away.
 */
function buildComponents(
  docId: string | undefined,
  citations: Citation[],
  onPreview?: CitationPreviewHandler,
): Components {
  return {
    a: ({ href, children, ...props }) => {
      if (href?.startsWith(CITE_PREFIX)) {
        const index = Number.parseInt(href.slice(CITE_PREFIX.length), 10);
        const citation = citations[index];
        if (citation) {
          return <CitationChip citation={citation} index={index + 1} onPreview={onPreview} />;
        }
      }
      return (
        <a
          {...props}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-ink underline decoration-line decoration-1 underline-offset-2 hover:decoration-ink"
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt, ...props }) => {
      const raw = typeof src === "string" ? src : "";
      if (!raw) return null;
      const resolved =
        docId && !isAbsoluteUrl(raw)
          ? `/api/docs/${encodeURIComponent(docId)}/image/${encodeURIComponent(raw)}`
          : raw;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...props}
          src={resolved}
          alt={alt ?? ""}
          loading="lazy"
          className="my-3 max-h-[520px] w-auto max-w-full rounded-lg border border-line bg-white object-contain"
        />
      );
    },
    table: ({ children }) => <TableFrame>{children}</TableFrame>,
    pre: ({ children }) => <CodeFrame>{children}</CodeFrame>,
  };
}

export function Markdown({
  children,
  docId,
  onCite,
  citations: enriched,
  className,
  compact,
}: {
  children: string;
  docId?: string;
  onCite?: CitationPreviewHandler;
  /** Citations from the answer's citations frame: bbox, block id, doc id. */
  citations?: Citation[];
  className?: string;
  compact?: boolean;
}) {
  const segments = tokenizeCitations(children);
  const enrichedByKey = new Map((enriched ?? []).map((item) => [citationKey(item), item]));
  const citations: Citation[] = [];
  const numbered = new Map<string, number>();
  const prepared = segments
    .map((segment) => {
      if (segment.kind === "text") return segment.text;
      const key = citationKey(segment.citation);
      const citation = enrichedByKey.get(key) ?? segment.citation;
      let index = numbered.get(key);
      if (index === undefined) {
        index = citations.push(citation) - 1;
        numbered.set(key, index);
      }
      return `[${index + 1}](${CITE_PREFIX}${index})`;
    })
    .join("");

  return (
    <div className={cn("md-body", compact && "md-body-compact", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={buildComponents(docId, citations, onCite)}
      >
        {prepared}
      </ReactMarkdown>
    </div>
  );
}

/** Rows of a rendered table, as delimiter-joined text. */
function tableRows(table: HTMLTableElement): string[][] {
  return [...table.rows].map((row) =>
    [...row.cells].map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim()),
  );
}

function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(","),
    )
    .join("\n");
}

function toMarkdownTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [head, ...body] = rows;
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  const divider = `| ${(head ?? []).map(() => "---").join(" | ")} |`;
  return [line(head ?? []), divider, ...body.map(line)].join("\n");
}

/** A table that can leave as CSV or Markdown — answers are data, not prose. */
function TableFrame({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const extract = () => {
    const table = ref.current?.querySelector("table");
    return table ? tableRows(table) : [];
  };
  return (
    <div className="group/table relative my-3">
      <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md border border-line bg-surface/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover/table:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          title="Copy table as Markdown"
          onClick={() => {
            const rows = extract();
            if (rows.length) void navigator.clipboard.writeText(toMarkdownTable(rows));
          }}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          Copy
        </button>
        <button
          type="button"
          title="Download table as CSV"
          onClick={() => {
            const rows = extract();
            if (rows.length) downloadFile("table.csv", toCsv(rows), "text/csv;charset=utf-8");
          }}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          CSV
        </button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table>{children}</table>
      </div>
    </div>
  );
}

/** Code block with a copy affordance. */
function CodeFrame({ children }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="group/code relative">
      <button
        type="button"
        title="Copy code"
        onClick={() => {
          const text = ref.current?.textContent ?? "";
          if (!text) return;
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          });
        }}
        className="absolute right-1.5 top-1.5 z-10 cursor-pointer rounded border border-line bg-surface/95 px-1.5 py-0.5 text-[10px] text-ink-muted opacity-0 shadow-sm transition-opacity hover:text-ink group-hover/code:opacity-100 focus:opacity-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <div ref={ref}>{children}</div>
    </div>
  );
}

/** Plain text with citation tags removed — used for copy and history. */
export function stripCitations(text: string): string {
  return tokenizeCitations(text)
    .filter((segment) => segment.kind === "text")
    .map((segment) => (segment.kind === "text" ? segment.text : ""))
    .join("")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

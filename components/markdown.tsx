"use client";

import { createContext, useContext, useRef, useState, type ComponentProps } from "react";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { citationKey, tokenizeCitations } from "@/lib/citations";
import { downloadFile } from "@/lib/chat-export";
import { paragraphRendersBlock } from "@/lib/markdown-blocks";
import { normalizeMath } from "@/lib/markdown-math";
import type { Citation } from "@/lib/pageindex/types";
import { CitationChip, type CitationPreviewHandler } from "./citation-chip";
import { MermaidDiagram } from "./markdown-mermaid";
import { cn } from "./ui-kit";

function isAbsoluteUrl(value: string): boolean {
  return /^(https?:|data:|blob:)/i.test(value);
}

const CITE_PREFIX = "#pi-cite-";

/**
 * OCR pages and answers are markdown. Four adjustments matter here:
 *  - citation tags are swapped for inline links (`#pi-cite-N`) and rendered back
 *    as numbered chips, with the same source reusing its number;
 *  - LaTeX is normalized (`lib/markdown-math.ts`) and rendered through KaTeX, so
 *    `\(A\)` and `\[ … \]` stop leaking their delimiters as literal text;
 *  - embedded figures come back as bare image ids (e.g. `img-7.jpeg`), routed
 *    through the API's presigned-image endpoint;
 *  - links open in a new tab so a click never navigates the reader away.
 *
 * The overrides live in one module-level map and read their per-answer data
 * from context: a map rebuilt per render gives react-markdown new component
 * types, which makes React remount the chip (and the diagram, and every image)
 * whenever anything above re-renders.
 */
const MarkdownScopeContext = createContext<{
  docId?: string;
  citations: Citation[];
  onPreview?: CitationPreviewHandler;
}>({ citations: [] });

const REMARK_PLUGINS: ComponentProps<typeof ReactMarkdown>["remarkPlugins"] = [
  remarkGfm,
  // Single dollars are enabled because `normalizeMath` has already escaped the
  // currency ones; leaving remark-math on its defaults without that pass turns
  // "$5 … $10" into a formula.
  [remarkMath, { singleDollarTextMath: true }],
];

const REHYPE_PLUGINS: ComponentProps<typeof ReactMarkdown>["rehypePlugins"] = [
  // OCR is not a TeX compiler: an unbalanced `\left(` should print in red, not
  // throw during render and take the whole page down with it.
  [rehypeKatex, { throwOnError: false, strict: false, trust: false }],
];

type AnchorProps = ComponentProps<"a"> & ExtraProps;
type ImageProps = ComponentProps<"img"> & ExtraProps;
type PreProps = ComponentProps<"pre"> & ExtraProps;
type TableProps = ComponentProps<"table"> & ExtraProps;
type ParagraphProps = ComponentProps<"p"> & ExtraProps;

function MarkdownLink({ href, children, ...props }: AnchorProps) {
  const { citations, onPreview } = useContext(MarkdownScopeContext);
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
}

function MarkdownImage({ src, alt }: ImageProps) {
  const { docId } = useContext(MarkdownScopeContext);
  const raw = typeof src === "string" ? src : "";
  if (!raw) return null;
  const resolved =
    docId && !isAbsoluteUrl(raw)
      ? `/api/docs/${encodeURIComponent(docId)}/image/${encodeURIComponent(raw)}`
      : raw;
  return <ImageFrame src={resolved} alt={alt ?? ""} />;
}

function MarkdownTable({ children }: TableProps) {
  return <TableFrame>{children}</TableFrame>;
}

/**
 * Images become `<figure>`s, which cannot live inside `<p>`: the browser closes
 * the paragraph while parsing and React then reports a hydration mismatch. Those
 * paragraphs render as a block container instead — `.md-block` carries the same
 * spacing so the two are visually identical.
 */
function MarkdownParagraph({ node, children }: ParagraphProps) {
  if (paragraphRendersBlock(node)) return <div className="md-block">{children}</div>;
  return <p>{children}</p>;
}

function MarkdownPre({ children }: PreProps) {
  const fence = readFence(children);
  if (fence.lang === "mermaid") return <MermaidDiagram code={fence.text} />;
  return <CodeFrame>{children}</CodeFrame>;
}

const MARKDOWN_COMPONENTS: Components = {
  a: MarkdownLink,
  img: MarkdownImage,
  p: MarkdownParagraph,
  table: MarkdownTable,
  pre: MarkdownPre,
};

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
  const segments = tokenizeCitations(normalizeMath(children));
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
      <MarkdownScopeContext.Provider value={{ docId, citations, onPreview: onCite }}>
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={MARKDOWN_COMPONENTS}
        >
          {prepared}
        </ReactMarkdown>
      </MarkdownScopeContext.Provider>
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

function toTsv(rows: string[][]): string {
  return rows.map((row) => row.join("\t")).join("\n");
}

/** A figure in an answer: keeps the image, gains download and copy-link. */
function ImageFrame({ src, alt }: { src: string; alt: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="group/image relative my-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="max-h-[520px] w-auto max-w-full rounded-lg border border-line bg-white object-contain"
      />
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-line bg-surface/95 p-0.5 opacity-0 shadow-sm transition-opacity group-hover/image:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          title="Copy image link"
          onClick={() => {
            void navigator.clipboard.writeText(new URL(src, window.location.href).href).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          {copied ? "Copied" : "Link"}
        </button>
        <button
          type="button"
          title="Download image"
          onClick={() => {
            void (async () => {
              try {
                const response = await fetch(src);
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = alt || "image";
                anchor.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              } catch {
                /* download is best effort */
              }
            })();
          }}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          Save
        </button>
      </div>
    </figure>
  );
}

/** Pull the language + text out of the `<code>` inside a fenced block. */
function readFence(children: React.ReactNode): { lang?: string; text: string } {
  const flatten = (node: React.ReactNode): string => {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(flatten).join("");
    const element = node as { props?: { children?: React.ReactNode } };
    return flatten(element.props?.children);
  };
  const first = Array.isArray(children) ? children[0] : children;
  const props = (first as { props?: { className?: string } } | null)?.props;
  const match = /language-([a-z0-9-]+)/i.exec(props?.className ?? "");
  return { lang: match?.[1]?.toLowerCase(), text: flatten(children).replace(/\n$/, "") };
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
          title="Copy table as TSV"
          onClick={() => {
            const rows = extract();
            if (rows.length) void navigator.clipboard.writeText(toTsv(rows));
          }}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          TSV
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
        <button
          type="button"
          title="Download table as Markdown"
          onClick={() => {
            const rows = extract();
            if (rows.length) {
              downloadFile("table.md", toMarkdownTable(rows), "text/markdown;charset=utf-8");
            }
          }}
          className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          MD
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
  const ref = useRef<HTMLPreElement | null>(null);
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
      {/* Keep the <pre>: dropping it loses whitespace and the block styling. */}
      <pre ref={ref}>{children}</pre>
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

"use client";

import type { Citation } from "@/lib/pageindex/types";

/** Strip the citation markup the answer text still carries. */
function plain(text: string): string {
  return text
    .replace(/<doc=[^>]*>/g, "")
    .replace(/<cite\b[^>]*\/>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface ExportInput {
  question?: string;
  answer: string;
  citations: Citation[];
  title?: string;
}

/** The answer as a portable Markdown document, sources included. */
export function toMarkdown({ question, answer, citations, title }: ExportInput): string {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`, "");
  if (question) lines.push(`**Question.** ${plain(question)}`, "");
  lines.push(plain(answer));

  if (citations.length > 0) {
    lines.push("", "## Sources", "");
    const seen = new Set<string>();
    let index = 1;
    for (const citation of citations) {
      const key = `${citation.document}|${citation.page}|${citation.blockId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const block = citation.blockId ? ` · \`${citation.blockId}\`` : "";
      lines.push(`${index}. ${citation.document} — page ${citation.page}${block}`);
      index += 1;
    }
  }
  return `${lines.join("\n").trim()}\n`;
}

export function downloadFile(filename: string, content: string, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next task so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(value: string, fallback = "answer"): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || fallback;
}

const PRINT_CSS = `
  :root { color-scheme: light; }
  body { font: 15px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color: #16161a; margin: 0; padding: 32px 40px; }
  .doc { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #6b6b76; font-size: 12px; margin: 0 0 24px; }
  h2 { font-size: 15px; margin: 24px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #e7e7ee; }
  h3 { font-size: 14px; margin: 18px 0 4px; }
  p, li { margin: 0 0 8px; }
  ul, ol { padding-left: 22px; }
  blockquote { margin: 12px 0; padding-left: 12px; border-left: 3px solid #cfcfda; color: #3a3a44; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; margin: 10px 0; }
  th, td { border: 1px solid #e2e2ea; padding: 5px 8px; text-align: left; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
  pre { background: #f6f6fa; padding: 10px; border-radius: 8px; overflow: auto; }
  img { max-width: 100%; height: auto; }
  button { all: unset; }
  @media print { body { padding: 0; } .doc { max-width: none; } }
`;

/**
 * "Save as PDF" without a PDF library: render the answer into a print window,
 * which every browser turns into a PDF through its own dialog.
 */
export function printAnswer(node: HTMLElement | null, title: string, question?: string) {
  if (!node) return;
  const frame = window.open("", "_blank", "width=900,height=720");
  if (!frame) return;
  frame.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>` +
      `<style>${PRINT_CSS}</style></head><body><div class="doc">` +
      `<h1>${escapeHtml(title)}</h1>` +
      (question ? `<p class="meta">${escapeHtml(plain(question))}</p>` : "") +
      node.innerHTML +
      `</div></body></html>`,
  );
  frame.document.close();
  frame.focus();
  setTimeout(() => frame.print(), 350);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

"use client";

import type { Citation } from "@/lib/pageindex/types";

/** Strip the citation markup the answer text still carries. */
function plain(text: string): string {
  return text
    .replace(/<doc=[^>]*>/g, "")
    .replace(/<cite\b[^>]*\/>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
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

/**
 * Word export. `docx` is large, so it is imported only when the reader actually
 * asks for a .docx; the markdown is converted with a deliberately small subset
 * (headings, lists, tables, quotes, code, paragraphs).
 */
export async function exportDocx(input: ExportInput): Promise<void> {
  const {
    Document,
    Packer,
    Paragraph,
    HeadingLevel,
    TextRun,
    Table,
    TableRow,
    TableCell,
    WidthType,
  } = await import("docx");

  const sources = input.citations
    .filter((citation, index, all) => {
      const key = `${citation.document}|${citation.page}|${citation.blockId ?? ""}`;
      return all.findIndex((item) => `${item.document}|${item.page}|${item.blockId ?? ""}` === key) === index;
    })
    .map(
      (citation, index) =>
        new Paragraph({
          text: `${index + 1}. ${citation.document} — page ${citation.page}`,
          bullet: { level: 0 },
        }),
    );

  type Block = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;
  const children: Block[] = [];
  const push = (item: Block) => {
    children.push(item);
  };

  if (input.title) push(new Paragraph({ text: input.title, heading: HeadingLevel.HEADING_1 }));
  if (input.question) {
    push(new Paragraph({ children: [new TextRun({ text: input.question, bold: true })] }));
    push(new Paragraph({ text: "" }));
  }

  const lines = plain(input.answer).split(/\r?\n/);
  let tableBuffer: string[] = [];
  const flushTable = () => {
    if (tableBuffer.length === 0) return;
    const rows = tableBuffer
      .filter((line) => !/^\s*\|?[\s:-]*-{3,}[\s:|-]*\|?\s*$/.test(line))
      .map((line) =>
        line
          .replace(/^\s*\||\|\s*$/g, "")
          .split("|")
          .map((cell) => cell.trim()),
      );
    tableBuffer = [];
    if (rows.length === 0) return;
    push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows.map(
          (cells) =>
            new TableRow({
              children: cells.map(
                (cell) => new TableCell({ children: [new Paragraph({ text: cell })] }),
              ),
            }),
        ),
      }),
    );
    push(new Paragraph({ text: "" }));
  };

  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      tableBuffer.push(line);
      continue;
    }
    flushTable();

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4][
        heading[1]!.length - 1
      ]!;
      push(new Paragraph({ text: stripInline(heading[2]!), heading: level }));
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      push(new Paragraph({ text: stripInline(line.replace(/^\s*[-*+]\s+/, "")), bullet: { level: 0 } }));
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      push(new Paragraph({ text: stripInline(line.replace(/^\s*\d+[.)]\s+/, "")), bullet: { level: 0 } }));
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      push(
        new Paragraph({
          children: [new TextRun({ text: stripInline(line.replace(/^\s*>\s?/, "")), italics: true })],
        }),
      );
      continue;
    }
    if (!line.trim()) {
      push(new Paragraph({ text: "" }));
      continue;
    }
    push(
      new Paragraph({ children: [new TextRun({ text: stripInline(line), font: "Calibri" })] }),
    );
  }
  flushTable();

  if (sources.length > 0) {
    push(new Paragraph({ text: "Sources", heading: HeadingLevel.HEADING_2 }));
    sources.forEach(push);
  }

  const docFile = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(docFile);
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(input.question ?? input.title ?? "answer")}.docx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * PDF export.
 *
 * Rendered straight into jsPDF rather than rasterising the DOM: html2canvas
 * cannot parse the modern colour functions Tailwind v4 emits (`oklch`/`lab`),
 * and a full-page raster blocks the main thread for seconds. Text stays
 * selectable, tables stay readable, and the file is small.
 */
export async function exportPdf(input: ExportInput, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 48;
  const width = pageWidth - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed <= pageHeight - margin) return;
    pdf.addPage();
    y = margin;
  };

  const write = (
    text: string,
    options: { size?: number; style?: "normal" | "bold" | "italic"; indent?: number; gap?: number } = {},
  ) => {
    const { size = 11, style = "normal", indent = 0, gap = 4 } = options;
    pdf.setFont("helvetica", style);
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width - indent) as string[];
    for (const line of lines) {
      ensure(size * 1.45);
      pdf.text(line, margin + indent, y);
      y += size * 1.45;
    }
    y += gap;
  };

  if (input.title) write(input.title, { size: 18, style: "bold", gap: 8 });
  if (input.question) {
    write(input.question, { size: 11, style: "italic", gap: 10 });
  }

  const lines = plain(input.answer).split(/\r?\n/);
  let tableRows: string[][] = [];
  const flushTable = () => {
    if (tableRows.length === 0) return;
    const rows = tableRows;
    tableRows = [];
    const columns = Math.max(...rows.map((row) => row.length));
    const columnWidth = width / Math.max(1, columns);
    for (const [index, row] of rows.entries()) {
      ensure(16);
      const isHead = index === 0;
      pdf.setFont("helvetica", isHead ? "bold" : "normal");
      pdf.setFontSize(9);
      row.forEach((cell, column) => {
        const [line = ""] = pdf.splitTextToSize(cell, columnWidth - 6) as string[];
        pdf.text(line, margin + column * columnWidth + 3, y);
      });
      pdf.setDrawColor(226, 226, 234);
      pdf.line(margin, y + 3, margin + width, y + 3);
      y += 14;
    }
    y += 6;
  };

  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) {
        tableRows.push(
          line
            .replace(/^\s*\||\|\s*$/g, "")
            .split("|")
            .map((cell) => cell.trim()),
        );
      }
      continue;
    }
    flushTable();

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      write(stripInline(heading[2]!), {
        size: [16, 14, 12, 11][heading[1]!.length - 1]!,
        style: "bold",
        gap: 6,
      });
      continue;
    }
    if (/^\s*```/.test(line)) continue;
    if (/^\s*[-*+]\s+/.test(line)) {
      write(`• ${stripInline(line.replace(/^\s*[-*+]\s+/, ""))}`, { indent: 12, gap: 2 });
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      write(stripInline(line), { indent: 12, gap: 2 });
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      write(stripInline(line.replace(/^\s*>\s?/, "")), { style: "italic", indent: 12, gap: 4 });
      continue;
    }
    if (!line.trim()) {
      y += 4;
      continue;
    }
    write(stripInline(line));
  }
  flushTable();

  if (input.citations.length > 0) {
    write("Sources", { size: 13, style: "bold", gap: 6 });
    const seen = new Set<string>();
    let index = 1;
    for (const citation of input.citations) {
      const key = `${citation.document}|${citation.page}|${citation.blockId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      write(`${index}. ${citation.document} — page ${citation.page}`, { size: 10, indent: 12, gap: 1 });
      index += 1;
    }
  }

  pdf.save(`${filename}.pdf`);
}

function stripInline(value: string): string {
  return value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`~]/g, "")
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

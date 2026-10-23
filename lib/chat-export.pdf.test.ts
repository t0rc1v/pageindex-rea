import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { exportPdf } from "./chat-export";

/**
 * Integration test: jsPDF runs for real in Node and writes the file, so this
 * covers the layout code and the library together. Page count is read back out
 * of the PDF's object table.
 */
const dir = path.join(process.cwd(), ".tmp-pdf-test");

function pageCount(file: string): number {
  const text = readFileSync(file, "latin1");
  return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

const ANSWER = `## Risk Factors

Supply concentration is the principal operational risk.

- single-source components
- freight volatility

1. one
2. two

> a quoted line

\`\`\`ts
const x = 1;
\`\`\`

| Metric | FY24 |
| --- | --- |
| Revenue | 4.2 |
`;

beforeAll(() => {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("exportPdf", () => {
  it("writes a valid PDF for headings, lists, quotes, tables and sources", async () => {
    const base = path.join(dir, "q2-review");
    await exportPdf(
      {
        title: "Q2 review",
        question: "What changed?",
        answer: ANSWER,
        citations: [
          { document: "Annual Report 2024.pdf", page: 12, blockId: "p12_text_1" },
          { document: "Annual Report 2024.pdf", page: 12, blockId: "p12_text_1" },
          { document: "Annual Report 2024.pdf", page: 14 },
        ],
      },
      base,
    );

    const buf = readFileSync(`${base}.pdf`);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(buf.byteLength).toBeGreaterThan(1000);
    expect(pageCount(`${base}.pdf`)).toBeGreaterThanOrEqual(1);
  });

  it("paginates a long answer", async () => {
    const base = path.join(dir, "long");
    const long = Array.from(
      { length: 120 },
      (_, index) => `Paragraph ${index} ${"lorem ipsum dolor sit amet ".repeat(12)}`,
    ).join("\n\n");

    await exportPdf({ answer: long, citations: [] }, base);

    expect(pageCount(`${base}.pdf`)).toBeGreaterThan(2);
  });

  it("survives an empty answer", async () => {
    const base = path.join(dir, "empty");
    await exportPdf({ answer: "", citations: [] }, base);
    const buf = readFileSync(`${base}.pdf`);
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

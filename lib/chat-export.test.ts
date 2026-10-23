import { describe, expect, it } from "vitest";

import { safeFilename, toMarkdown } from "./chat-export";

const DOC = "Annual Report 2024.pdf";

describe("toMarkdown", () => {
  const markdown = toMarkdown({
    title: "Q2 review",
    question: "What changed in Q2?",
    answer: `Revenue grew 12% <doc=${DOC};page=12;block=p12_text_1> and costs fell <cite doc="${DOC}" page="14"/>.\n\n- one\n- two`,
    citations: [
      { document: DOC, page: 12, blockId: "p12_text_1" },
      { document: DOC, page: 12, blockId: "p12_text_1" },
      { document: DOC, page: 14 },
    ],
  });

  it("carries the title and the question", () => {
    expect(markdown).toContain("# Q2 review");
    expect(markdown).toContain("**Question.** What changed in Q2?");
  });

  it("strips citation markup from the answer", () => {
    expect(markdown).not.toContain("<doc=");
    expect(markdown).not.toContain("<cite");
    expect(markdown).toContain("Revenue grew 12% and costs fell.");
  });

  it("lists each source once", () => {
    const sources = markdown.split("## Sources")[1] ?? "";
    expect(sources.match(/Annual Report 2024\.pdf — page 12/g)).toHaveLength(1);
    expect(sources).toContain("page 12 · `p12_text_1`");
    expect(sources).toContain("page 14");
  });

  it("keeps the answer's own structure", () => {
    expect(markdown).toContain("- one\n- two");
  });

  it("ends with a single newline", () => {
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown.endsWith("\n\n")).toBe(false);
  });
});

describe("safeFilename", () => {
  it("slugifies a question", () => {
    expect(safeFilename("What changed in Q2?")).toBe("what-changed-in-q2");
  });

  it("falls back when nothing is left", () => {
    expect(safeFilename("???")).toBe("answer");
  });

  it("caps the length", () => {
    expect(safeFilename("a".repeat(120)).length).toBeLessThanOrEqual(60);
  });
});

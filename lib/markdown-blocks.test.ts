import { describe, expect, it } from "vitest";

import { paragraphRendersBlock, type MarkdownNode } from "./markdown-blocks";

const text = (value: string): MarkdownNode => ({ type: "text", value });
const element = (tagName: string, children: MarkdownNode[] = []): MarkdownNode => ({
  type: "element",
  tagName,
  children,
});

const paragraph = (...children: MarkdownNode[]): MarkdownNode => element("p", children);

describe("paragraphRendersBlock", () => {
  it("leaves prose paragraphs alone", () => {
    expect(paragraphRendersBlock(paragraph(text("Revenue grew 14% "), element("strong")))).toBe(
      false,
    );
    expect(paragraphRendersBlock(paragraph(element("a")))).toBe(false);
  });

  it("flags a paragraph whose only content is a figure", () => {
    expect(paragraphRendersBlock(paragraph(text("\n"), element("img")))).toBe(true);
  });

  it("flags a figure nested in inline markup", () => {
    const strong = element("strong", [element("img")]);
    expect(paragraphRendersBlock(paragraph(text("See "), strong))).toBe(true);
  });

  it("flags tables and fenced code, which gain a wrapper element", () => {
    expect(paragraphRendersBlock(paragraph(element("table")))).toBe(true);
    expect(paragraphRendersBlock(paragraph(element("pre")))).toBe(true);
  });

  it("ignores non-element nodes and a missing node", () => {
    expect(paragraphRendersBlock(paragraph(text("plain text")))).toBe(false);
    expect(paragraphRendersBlock({ type: "comment", value: "<!-- figure -->" })).toBe(false);
    expect(paragraphRendersBlock(undefined)).toBe(false);
  });
});

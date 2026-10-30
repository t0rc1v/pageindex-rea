import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "./markdown";

const render = (source: string) => renderToStaticMarkup(createElement(Markdown, undefined, source));

/** The LaTeX source KaTeX keeps for screen readers; not what a reader sees. */
const withoutTexAnnotations = (html: string) =>
  html.replace(/<annotation[\s\S]*?<\/annotation>/g, "");

const katexCount = (html: string) => html.match(/<span class="katex">/g)?.length ?? 0;

/**
 * The report that started this: PageIndex writes `\(A\)` and `\[ … \]`, markdown
 * reads the backslash as an escape, and the formula arrived as `(A)`.
 */
const DETERMINANT_NOTES = [
  "Invertibility: \\(A\\) is singular exactly when \\(\\det A=0\\); if \\(A\\) is invertible, then \\(\\det A\\ne0\\).",
  "Product rule: \\[ \\det(AB)=\\det(A)\\det(B). \\]",
  "Inverse: For invertible \\(A\\), \\[ \\det(A^{-1})=\\frac{1}{\\det(A)}. \\]",
  "Transpose: \\[ \\det(A^{\\mathsf T})=\\det(A). \\]",
].join(" \n");

describe("Markdown math", () => {
  it("renders \\(inline\\) and \\[display\\] LaTeX instead of leaking the delimiters", () => {
    const html = render(DETERMINANT_NOTES);

    // Five inline formulas plus three display ones.
    expect(katexCount(html)).toBe(8);
    expect(withoutTexAnnotations(html)).not.toContain("\\(");
    expect(withoutTexAnnotations(html)).not.toContain("\\[");
  });

  it("renders a display delimiter that owns its line as a display block", () => {
    const html = render("Product rule:\n\\[\n\\det(AB)=\\det(A)\\det(B).\n\\]");

    expect(html).toContain('class="katex-display"');
    expect(html).toContain("<p>Product rule:</p>");
  });

  it("renders display math inside a list item without swallowing the next item", () => {
    // The shape the real model returns: list items whose display math is
    // indented to the item's content column. Emitting the closing `$$` at
    // column 0 lets the math block escape the item and consume the next bullets
    // as formula source, which KaTeX then prints as a red error.
    const source = [
      "5. **Singularity**",
      "   \\[",
      "   \\det(A)=0",
      "   \\quad\\Longleftrightarrow\\quad",
      "   A\\text{ is singular}",
      "   \\]",
      "",
      "6. **Row operations**",
      "   - Multiplying a row by \\(c\\) multiplies the determinant by \\(c\\).",
    ].join("\n");

    const html = render(source);

    expect(html.match(/<li>/g)).toHaveLength(3); // two items + the nested bullet
    expect(html).not.toContain("katex-error");
    expect(katexCount(html)).toBe(3);
    expect(html).toContain("Multiplying a row by");
  });

  it("leaves dollar amounts as dollars in financial prose", () => {
    const html = render("Revenue grew 12% to $4.2bn, led by Cloud at $1.6bn.");

    expect(katexCount(html)).toBe(0);
    expect(html).toContain("$4.2bn");
    expect(html).toContain("$1.6bn");
  });

  it("renders a formula that follows an amount", () => {
    const html = render("Revenue was $4.2bn, and $x$ is the growth rate.");

    expect(katexCount(html)).toBe(1);
    expect(html).toContain("$4.2bn");
    expect(html).not.toContain("katex-error");
  });

  it("does not let bold text between an amount and a formula start math", () => {
    const html = render("Revenue was $5 and **Invertibility:** $A$ is singular.");

    expect(katexCount(html)).toBe(1);
    expect(html).not.toContain("katex-error");
    expect(html).toContain("$5");
  });

  it("still renders single-dollar math", () => {
    const html = render("Let $x^2$ be inline math.");

    expect(katexCount(html)).toBe(1);
  });

  it("does not touch LaTeX inside code spans or fences", () => {
    const html = render("Code `\\(x\\)` and\n\n```tex\n\\[y\\]\n```");

    expect(katexCount(html)).toBe(0);
    expect(html).toContain("\\(x\\)");
    expect(html).toContain("\\[y\\]");
  });

  it("prints broken LaTeX instead of throwing", () => {
    const html = render("\\(\\frac{1}{\\)");

    expect(html).toContain("katex-error");
  });
});

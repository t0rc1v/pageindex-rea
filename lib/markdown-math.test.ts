import { describe, expect, it } from "vitest";

import { normalizeMath } from "./markdown-math";

describe("normalizeMath", () => {
  it("rewrites the LaTeX delimiters PageIndex writes", () => {
    expect(normalizeMath("Invertibility: \\(A\\) is singular when \\(\\det A=0\\).")).toBe(
      "Invertibility: $A$ is singular when $\\det A=0$.",
    );
    expect(normalizeMath("\\[ \\det(AB)=\\det(A)\\det(B). \\]")).toBe(
      "$$\n\\det(AB)=\\det(A)\\det(B).\n$$",
    );
  });

  it("keeps display math in a sentence inline, at display size", () => {
    const source = "Product rule: \\[ \\det(AB)=\\det(A)\\det(B). \\]";
    expect(normalizeMath(source)).toBe("Product rule: $\\displaystyle \\det(AB)=\\det(A)\\det(B).$");
  });

  it("handles display math across lines and keeps commands intact", () => {
    const source = "Inverse: \\[\n\\det(A^{-1})=\\frac{1}{\\det(A)}.\n\\]";
    expect(normalizeMath(source)).toBe("Inverse: $\\displaystyle \\det(A^{-1})=\\frac{1}{\\det(A)}.$");
    expect(normalizeMath("\\[\n\\det(A^{\\mathsf T})=\\det(A).\n\\]")).toBe(
      "$$\n\\det(A^{\\mathsf T})=\\det(A).\n$$",
    );
  });

  it("keeps the closing fence inside a list item", () => {
    expect(normalizeMath("   \\[\n   \\det(I)=1.\n   \\]")).toBe(
      "   $$\n   \\det(I)=1.\n   $$",
    );
  });

  it("lifts a display-only environment onto its own lines", () => {
    const source = "Recurrence: \\[ \\begin{align} a &= b \\\\ c &= d \\end{align} \\]";
    expect(normalizeMath(source)).toBe(
      "Recurrence: \n$$\n\\begin{align} a &= b \\\\ c &= d \\end{align}\n$$\n",
    );
  });

  it("leaves an unterminated or empty delimiter alone", () => {
    expect(normalizeMath("an open \\( here")).toBe("an open \\( here");
    expect(normalizeMath("empty \\(  \\) math")).toBe("empty \\(  \\) math");
    expect(normalizeMath("inline \\(a\n\nb\\) across a paragraph")).toBe(
      "inline \\(a\n\nb\\) across a paragraph",
    );
  });

  it("escapes dollar amounts instead of reading them as math", () => {
    expect(normalizeMath("Revenue grew 12% to $4.2bn, led by Cloud at $1.6bn.")).toBe(
      "Revenue grew 12% to \\$4.2bn, led by Cloud at \\$1.6bn.",
    );
    expect(normalizeMath("Cost $5 and revenue $10.")).toBe("Cost \\$5 and revenue \\$10.");
    expect(normalizeMath("The price rose to $4.2bn.")).toBe("The price rose to \\$4.2bn.");
  });

  it("keeps well-formed inline math and display math", () => {
    expect(normalizeMath("Let $x^2$ be inline math.")).toBe("Let $x^2$ be inline math.");
    expect(normalizeMath("$$\\det A$$")).toBe("$$\\det A$$");
    expect(normalizeMath("The exponent $2^n$ grows fast.")).toBe(
      "The exponent $2^n$ grows fast.",
    );
    expect(normalizeMath("Already escaped \\$5 stays")).toBe("Already escaped \\$5 stays");
  });

  it("does not let an amount swallow a formula later in the sentence", () => {
    expect(normalizeMath("Revenue was $4.2bn, and $x$ is the growth rate.")).toBe(
      "Revenue was \\$4.2bn, and $x$ is the growth rate.",
    );
    expect(normalizeMath("Revenue $4.2bn and margin $x$")).toBe(
      "Revenue \\$4.2bn and margin $x$",
    );
    // Markdown emphasis between the two must not look like a math operator.
    expect(normalizeMath("Revenue was $5 and **Invertibility:** $A$ is singular.")).toBe(
      "Revenue was \\$5 and **Invertibility:** $A$ is singular.",
    );
    expect(normalizeMath("For $5 you get **$x$** units.")).toBe(
      "For \\$5 you get **$x$** units.",
    );
  });

  it("leaves a digit-led dollar pair as money unless it carries math", () => {
    expect(normalizeMath("Prices: $4.2bn$ and $1.6bn$.")).toBe(
      "Prices: \\$4.2bn\\$ and \\$1.6bn\\$.",
    );
  });

  it("never pairs dollars across a paragraph break", () => {
    expect(normalizeMath("$x\n\ny$")).toBe("\\$x\n\ny\\$");
  });

  it("leaves code alone", () => {
    const source = [
      "Math \\(a\\) and code `\\(b\\)` and a stray `$5`.",
      "",
      "```tex",
      "\\(c\\) and $10",
      "```",
      "",
      "~~~",
      "\\[d\\]",
      "~~~",
      "",
      "After \\(e\\).",
    ].join("\n");
    expect(normalizeMath(source)).toBe(
      [
        "Math $a$ and code `\\(b\\)` and a stray `$5`.",
        "",
        "```tex",
        "\\(c\\) and $10",
        "```",
        "",
        "~~~",
        "\\[d\\]",
        "~~~",
        "",
        "After $e$.",
      ].join("\n"),
    );
  });

  it("is a no-op for plain prose and already-normalized math", () => {
    expect(normalizeMath("No math here.")).toBe("No math here.");
    expect(normalizeMath("$x$ and $$y$$")).toBe("$x$ and $$y$$");
  });
});

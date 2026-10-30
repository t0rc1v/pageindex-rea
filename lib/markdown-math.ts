/**
 * LaTeX in OCR markdown and in answers, turned into something remark-math can
 * parse.
 *
 * Two things go wrong without this pass:
 *
 *  - PageIndex writes display math as `\[ … \]` and inline math as `\( … \)`.
 *    CommonMark treats `\(` and `\[` as *escaped punctuation*, so the backslash
 *    disappears and the reader sees `(A)` where `\(A\)` was — the formula looks
 *    like prose that lost a character. The delimiters have to be rewritten
 *    before remark parses the source.
 *  - remark-math's single-dollar rule is greedy. Against a financial report it
 *    reads `Revenue grew to $4.2bn, led by Cloud at $1.6bn` as one formula.
 *    Every `$` that is not a well-formed inline-math pair is escaped here, so a
 *    dollar amount stays a dollar amount.
 *
 * Both rewrites skip fenced code and inline code: a snippet showing `\(x\)` is
 * documentation, not math. This module is deliberately free of React and
 * unified so the rules can be unit tested on plain strings.
 */

/** Escaped punctuation (`\$`) keeps the backslashes; count them to tell. */
function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) backslashes++;
  return backslashes % 2 === 1;
}

function runLength(text: string, start: number, char: string): number {
  let end = start;
  while (text[end] === char) end++;
  return end - start;
}

/** True when only whitespace precedes `index` on its line. */
function atLineStart(text: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    if (text[i] === "\n") return true;
    if (text[i] !== " " && text[i] !== "\t") return false;
  }
  return true;
}

type Fence = { char: "`" | "~"; length: number };

/** An opening code fence at `index`, with up to three spaces of indentation. */
function fenceAt(text: string, index: number): Fence | null {
  if (text[index] !== "`" && text[index] !== "~") return null;
  let indent = 0;
  for (let i = index - 1; i >= 0 && text[i] === " "; i--) indent++;
  if (indent > 3 || !atLineStart(text, index)) return null;
  const char = text[index] as "`" | "~";
  const length = runLength(text, index, char);
  return length >= 3 ? { char, length } : null;
}

/**
 * Index just past the closing fence line, or the end of the source. `from` is
 * the first character after the opening line: the opening fence itself matches
 * the closing pattern, so scanning cannot start there.
 */
function fenceEnd(text: string, from: number, fence: Fence): number {
  let lineStart = from;
  while (lineStart < text.length) {
    const lineEnd = text.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;
    const match = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(text.slice(lineStart, end));
    const run = match?.[1];
    if (run && run[0] === fence.char && run.length >= fence.length) return end;
    if (lineEnd === -1) break;
    lineStart = lineEnd + 1;
  }
  return text.length;
}

/** Index just past the closing backtick run, or -1 when the span never closes. */
function inlineCodeEnd(text: string, start: number, length: number): number {
  let i = start + length;
  while (i < text.length) {
    const next = text.indexOf("`", i);
    if (next === -1) return -1;
    const run = runLength(text, next, "`");
    if (run === length) return next + run;
    i = next + run;
  }
  return -1;
}

function transformProse(text: string): string {
  return escapeCurrencyDollars(convertLatexDelimiters(text));
}

/** True when nothing but whitespace follows `from` on its line. */
function lineEndsAfter(text: string, from: number): boolean {
  for (let i = from; i < text.length; i++) {
    if (text[i] === "\n") return true;
    if (text[i] !== " " && text[i] !== "\t" && text[i] !== "\r") return false;
  }
  return true;
}

/** The whitespace before `index` on its line, when the line holds nothing else. */
function lineIndent(text: string, index: number): string {
  let start = index;
  while (start > 0 && text[start - 1] !== "\n") start--;
  return text.slice(start, index);
}

/** Environments KaTeX refuses to set outside display mode. */
const DISPLAY_ONLY = /\\(?:begin|end)\{(?:align|alignat|gather|equation|split)\*?\}/;

/**
 * Rewrite `\( … \)` / `\[ … \]` as `$ … $` / `$$ … $$`.
 *
 * A display delimiter that owns its line becomes a real block — remark only
 * treats `$$` as display when the fence starts a line, so an inline rewrite
 * there would render a fraction small. One that sits inside a sentence cannot
 * be moved to its own line without restructuring the paragraph (and breaking a
 * list item it lives in), so it stays inline and gains `\displaystyle`: KaTeX's
 * display spacing without a block of its own. The exception is a display-only
 * environment (`align`, `gather`, …), which KaTeX will not render inline at
 * all; there the formula is lifted onto its own lines and the paragraph splits.
 */
function convertLatexDelimiters(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "\\" && !isEscaped(text, i)) {
      const delimiter = text[i + 1];
      if (delimiter === "(" || delimiter === "[") {
        const close = findDelimiter(text, i + 2, delimiter === "(" ? ")" : "]");
        if (close !== -1) {
          const body = text.slice(i + 2, close).trim();
          const inline = delimiter === "(";
          // Inline math cannot cross a paragraph break; display math can.
          const usable = body.length > 0 && (inline ? !/\n[ \t]*\n/.test(body) : true);
          if (usable) {
            if (inline) {
              out += `$${body}$`;
            } else if (atLineStart(text, i) && lineEndsAfter(text, close + 2)) {
              // Both fences and every body line must sit at the opening line's
              // indentation. A model writes display math inside a list item with
              // the item's indent; a body or closer at column 0 ends the list
              // item, and the rest of the list is parsed as formula source.
              const indent = lineIndent(text, i);
              const lines = body
                .split("\n")
                .map((line) => (line.trim() ? indent + line.trimStart() : ""));
              out += `$$\n${lines.join("\n")}\n${indent}$$`;
            } else if (DISPLAY_ONLY.test(body)) {
              out += `\n$$\n${body}\n$$\n`;
            } else {
              out += `$\\displaystyle ${body}$`;
            }
            i = close + 2;
            continue;
          }
        }
      }
    }
    out += char;
    i++;
  }
  return out;
}

/** Index of the unescaped `\]` / `\)` that closes a delimiter, or -1. */
function findDelimiter(text: string, from: number, close: string): number {
  for (let i = from; i < text.length - 1; i++) {
    if (text[i] === "\\" && text[i + 1] === close && !isEscaped(text, i)) return i;
  }
  return -1;
}

/**
 * Dollar signs that cannot be a math pair are escaped so remark-math leaves
 * them alone. A pair is accepted only on the same side of a paragraph break,
 * with no whitespace hugging either delimiter, and with the closing `$` not
 * followed by a digit — the rules that keep `$5 … $10` from becoming a formula.
 */
function escapeCurrencyDollars(text: string): string {
  const singles: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "$" || isEscaped(text, i)) continue;
    const run = runLength(text, i, "$");
    if (run === 1) singles.push(i);
    i += run - 1;
  }
  if (singles.length === 0) return text;

  const paired = new Set<number>();
  let cursor = 0;
  while (cursor < singles.length) {
    const open = singles[cursor]!;
    if (!canOpenMath(text, open)) {
      cursor++;
      continue;
    }
    let match = -1;
    for (let next = cursor + 1; next < singles.length; next++) {
      const candidate = singles[next]!;
      if (!canCloseMath(text, candidate)) continue;
      const body = text.slice(open + 1, candidate);
      if (/\n[ \t]*\n/.test(body)) break;
      // A mechanically valid pair can still be an amount plus a later formula:
      // "Revenue was $4.2bn, and $x$ is the rate". The first `$` must not open a
      // span that swallows `$x`, so a digit-led span needs a math marker of its
      // own to count.
      if (!looksLikeMath(body, text[open + 1]!)) break;
      match = next;
      break;
    }
    if (match === -1) {
      cursor++;
      continue;
    }
    paired.add(open);
    paired.add(singles[match]!);
    cursor = match + 1;
  }

  let out = "";
  let last = 0;
  for (const index of singles) {
    if (paired.has(index)) continue;
    out += `${text.slice(last, index)}\\$`;
    last = index + 1;
  }
  return out + text.slice(last);
}

function canOpenMath(text: string, index: number): boolean {
  const next = text[index + 1];
  return next !== undefined && !/\s/.test(next);
}

/**
 * Money starts with a digit; math usually does not (`$x^2$`, `$\alpha$`). A
 * digit-led span is accepted only when it carries a marker that prose and
 * markdown emphasis do not: a command, superscript/subscript, brace or equals
 * sign. Arithmetic-only spans (`$2x+1$`) stay literal rather than risk pairing
 * `$5 … $A$` across a sentence; `\(2x+1\)` is unambiguous and still renders.
 */
function looksLikeMath(body: string, first: string): boolean {
  return !/[0-9]/.test(first) || /[\\^_{}=]/.test(body);
}

function canCloseMath(text: string, index: number): boolean {
  const previous = text[index - 1];
  const next = text[index + 1];
  if (previous === undefined || /\s/.test(previous)) return false;
  return next === undefined || !/[0-9$]/.test(next);
}

/**
 * Normalize math delimiters outside code. Safe to call on every render: prose
 * without `\(`, `\[` or an unpaired `$` comes back unchanged.
 */
export function normalizeMath(source: string): string {
  let out = "";
  let proseStart = 0;
  let i = 0;

  const flushProse = (end: number) => {
    if (end > proseStart) out += transformProse(source.slice(proseStart, end));
  };

  while (i < source.length) {
    const fence = fenceAt(source, i);
    if (fence) {
      flushProse(i);
      const lineEnd = source.indexOf("\n", i);
      const end = fenceEnd(source, lineEnd === -1 ? source.length : lineEnd + 1, fence);
      out += source.slice(i, end);
      i = end;
      proseStart = end;
      continue;
    }
    if (source[i] === "`" && !isEscaped(source, i)) {
      const length = runLength(source, i, "`");
      const end = inlineCodeEnd(source, i, length);
      if (end !== -1) {
        flushProse(i);
        out += source.slice(i, end);
        i = end;
        proseStart = end;
        continue;
      }
      i += length;
      continue;
    }
    i++;
  }

  flushProse(source.length);
  return out;
}

/**
 * One HTML nesting rule that markdown output cannot express on its own.
 *
 * react-markdown renders an `img` through our override as a `<figure>`, and a
 * table as a `<div>` wrapper. Both are block content, which HTML forbids inside
 * `<p>`. The browser closes the paragraph before the figure while parsing, so
 * React hydrates a tree that no longer matches the server's and logs
 * "<figure> cannot be a descendant of <p>" — or, for the figure's own toolbar,
 * "<div> cannot be a descendant of <p>" — on every page that shows a figure.
 *
 * A paragraph is a source-level construct, so the fix belongs to the renderer:
 * paragraphs that end up holding block content render as `<div>` instead. This
 * module is kept free of JSX so the rule can be unit tested on plain objects.
 */

/** The part of hast that this rule needs; `node` on a component override. */
export type MarkdownNode = {
  type: string;
  value?: string;
  tagName?: string;
  children?: MarkdownNode[];
};

/**
 * Tags this app turns into block-level markup: `img` becomes `<figure>`, and
 * `table`/`pre` gain a `<div>` toolbar or wrapper.
 */
const BLOCK_TAGS = new Set(["img", "table", "pre"]);

/** True when the paragraph itself, or anything nested in it, renders block markup. */
export function paragraphRendersBlock(node: MarkdownNode | undefined): boolean {
  return (node?.children ?? []).some(containsBlock);
}

function containsBlock(node: MarkdownNode): boolean {
  if (node.type !== "element") return false;
  if (node.tagName && BLOCK_TAGS.has(node.tagName)) return true;
  return (node.children ?? []).some(containsBlock);
}

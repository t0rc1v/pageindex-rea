"use client";

import { useMemo, useState } from "react";

import type { TreeNode } from "@/lib/pageindex/types";
import { cn } from "./ui-kit";

interface FlatNode {
  key: string;
  node: TreeNode;
  depth: number;
  /** Keys of every ancestor section, outermost first. */
  ancestors: string[];
}

function flatten(nodes: TreeNode[], depth = 0, ancestors: string[] = []): FlatNode[] {
  const rows: FlatNode[] = [];
  nodes.forEach((node, index) => {
    const key = `${node.node_id || "node"}-${index}`;
    rows.push({ key, node, depth, ancestors });
    if (node.nodes?.length) {
      rows.push(...flatten(node.nodes, depth + 1, [...ancestors, key]));
    }
  });
  return rows;
}

/**
 * The tree PageIndex builds from the document's own structure. Every node
 * carries the page its section starts on, so navigating the outline is
 * navigating the document.
 *
 * Expansion is derived, not stored: a section is open when the user said so,
 * when it is a top-level section, or when it contains the page being read.
 */
export function TreeOutline({
  nodes,
  activePage,
  onSelect,
  className,
}: {
  nodes: TreeNode[] | undefined;
  activePage: number;
  onSelect: (node: TreeNode) => void;
  className?: string;
}) {
  const flat = useMemo(() => flatten(nodes ?? []), [nodes]);
  const rootKeys = useMemo(
    () => new Set(flat.filter((row) => row.depth === 0).map((row) => row.key)),
    [flat],
  );
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  // Deepest node at or before the current page, and its ancestor chain.
  const activeAncestors = useMemo(() => {
    let best: FlatNode | undefined;
    for (const row of flat) {
      const page = row.node.page_index;
      if (typeof page !== "number" || page > activePage) continue;
      if (!best || page > best.node.page_index) best = row;
    }
    return new Set(best?.ancestors ?? []);
  }, [flat, activePage]);

  const isOpen = (key: string) =>
    overrides[key] ?? (activeAncestors.has(key) || rootKeys.has(key));

  if (!nodes?.length) {
    return (
      <div className={cn("px-4 py-6 text-[13px] leading-relaxed text-ink-muted", className)}>
        No outline yet. PageIndex builds the tree while the document is indexing.
      </div>
    );
  }

  const visible = flat.filter((row) => row.ancestors.every(isOpen));

  return (
    <nav className={cn("flex flex-col gap-0.5", className)} aria-label="Document outline">
      {visible.map((row) => {
        const { node, depth, key } = row;
        const hasChildren = Boolean(node.nodes?.length);
        const open = isOpen(key);
        const isActive = node.page_index === activePage;
        const covers = typeof node.page_index === "number" && node.page_index < activePage;

        return (
          <div key={key} className="flex items-start gap-1 pr-1" style={{ paddingLeft: `${depth * 12}px` }}>
            {hasChildren ? (
              <button
                type="button"
                aria-label={open ? "Collapse section" : "Expand section"}
                aria-expanded={open}
                onClick={() => setOverrides((current) => ({ ...current, [key]: !open }))}
                className="mt-1.5 grid size-4 shrink-0 cursor-pointer place-items-center rounded text-ink-muted hover:bg-ink/5 hover:text-ink"
              >
                <span
                  aria-hidden
                  className={cn(
                    "block size-0 border-y-[3.5px] border-l-[5px] border-y-transparent border-l-current transition-transform",
                    open && "rotate-90",
                  )}
                />
              </button>
            ) : (
              <span className="mt-1.5 size-4 shrink-0" />
            )}

            <button
              type="button"
              onClick={() => onSelect(node)}
              title={node.summary || node.text || node.title}
              className={cn(
                "flex min-w-0 flex-1 cursor-pointer items-baseline justify-between gap-2 rounded-lg px-1.5 py-1 text-left transition-colors",
                isActive
                  ? "bg-brand-soft text-brand-deep"
                  : covers
                    ? "text-ink hover:bg-ink/5"
                    : "text-ink-muted hover:bg-ink/5 hover:text-ink",
              )}
            >
              <span className="line-clamp-2 text-[12.5px] leading-snug">{node.title}</span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-60">
                {node.page_index}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}

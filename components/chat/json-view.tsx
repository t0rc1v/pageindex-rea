"use client";

import { useState } from "react";

import { cn } from "@/components/ui-kit";

/**
 * Compact JSON viewer for tool input/output ("View raw input and output").
 *
 * Deliberately dependency-free: tool payloads are small, the reader only needs
 * syntax colouring, collapse and copy — not a full editor.
 */
export function JsonView({
  value,
  className,
  depth = 0,
  defaultOpen = 3,
}: {
  value: unknown;
  className?: string;
  depth?: number;
  defaultOpen?: number;
}) {
  const [open, setOpen] = useState(depth < defaultOpen);

  if (value === null) return <span className="text-ink-muted">null</span>;
  if (value === undefined) return <span className="text-ink-muted">undefined</span>;

  if (typeof value === "string") {
    const isLong = value.length > 220;
    return (
      <span className="whitespace-pre-wrap break-words text-emerald-700">
        “{isLong && !open ? `${value.slice(0, 220)}…` : value}”
        {isLong && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-1 cursor-pointer text-[10px] text-ink-muted underline decoration-dotted"
          >
            {open ? "less" : "more"}
          </button>
        )}
      </span>
    );
  }
  if (typeof value === "number") return <span className="text-amber-700">{String(value)}</span>;
  if (typeof value === "boolean")
    return <span className="text-amber-700">{value ? "true" : "false"}</span>;

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);

  if (entries.length === 0) {
    return <span className="text-ink-muted">{isArray ? "[ ]" : "{ }"}</span>;
  }

  return (
    <div className={cn("min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer select-none text-[10px] text-ink-muted hover:text-ink"
        aria-expanded={open}
      >
        {open ? "▾" : "▸"} {isArray ? `[${entries.length}]` : `{${entries.length}}`}
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5 border-l border-line pl-2.5">
          {entries.map(([key, item]) => (
            <div key={key} className="min-w-0">
              <span className="text-ink-muted">{key}</span>
              <span className="text-ink-muted">: </span>
              <JsonView value={item} depth={depth + 1} defaultOpen={defaultOpen} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A titled, scrollable block used by the raw I/O dialog. */
export function JsonBlock({
  title,
  value,
  empty = "No payload for this lane.",
}: {
  title: string;
  value: unknown;
  empty?: string;
}) {
  const has = value !== undefined && value !== null;
  return (
    <section className="min-w-0">
      <h4 className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h4>
      <div className="max-h-[38vh] overflow-auto rounded-lg border border-line bg-paper/60 p-2.5 font-mono text-[11px] leading-relaxed">
        {has ? <JsonView value={value} /> : <span className="text-ink-muted">{empty}</span>}
      </div>
    </section>
  );
}

"use client";

import { Check, Copy, Download, FileText, Pencil, Printer, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  downloadFile,
  printAnswer,
  safeFilename,
  toMarkdown,
} from "@/lib/chat-export";
import type { Citation } from "@/lib/pageindex/types";
import { cn } from "@/components/ui-kit";

function stamp(at?: number): string | null {
  if (!at) return null;
  const date = new Date(at);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Today at ${time}` : `${date.toLocaleDateString()} at ${time}`;
}

function IconButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "cursor-pointer rounded-md p-1.5 text-ink-muted transition-colors hover:bg-paper hover:text-ink",
        active && "text-emerald-600",
      )}
    >
      {children}
    </button>
  );
}

/**
 * The row under a message: copy / export / regenerate for answers, copy / edit
 * for questions. Exports are client-side (Markdown, or the browser's own print
 * dialog for PDF) — there is no server to render a document.
 */
export function MessageActions({
  role,
  text,
  citations,
  question,
  title,
  at,
  getNode,
  onRegenerate,
  canRegenerate,
  onEdit,
}: {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  question?: string;
  title?: string;
  at?: number;
  getNode?: () => HTMLElement | null;
  onRegenerate?: () => void;
  canRegenerate?: boolean;
  onEdit?: (next: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copiedTimer.current) clearTimeout(copiedTimer.current);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover/message:opacity-100 sm:group-focus-within/message:opacity-100",
        // The export menu lives inside this row, so an open menu must pin the
        // row visible even when the pointer has moved into the dropdown.
        (menuOpen || copied) && "opacity-100",
      )}
    >
      <IconButton label={role === "user" ? "Copy message" : "Copy answer"} onClick={copy} active={copied}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </IconButton>

      {role === "assistant" && (
        <div className="relative" ref={menuRef}>
          <IconButton label="Download" onClick={() => setMenuOpen((value) => !value)}>
            <Download className="size-3.5" />
          </IconButton>
          {menuOpen && (
            <div className="absolute bottom-8 left-0 z-30 w-56 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-xl">
              <button
                type="button"
                onClick={() => {
                  const markdown = toMarkdown({ question, answer: text, citations: citations ?? [], title });
                  downloadFile(`${safeFilename(question ?? title ?? "answer")}.md`, markdown);
                  setMenuOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-paper"
              >
                <FileText className="size-3.5 text-ink-muted" aria-hidden /> Markdown (.md)
              </button>
              <button
                type="button"
                onClick={() => {
                  printAnswer(getNode?.() ?? null, title ?? "Answer", question);
                  setMenuOpen(false);
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-[12px] text-ink hover:bg-paper"
              >
                <Printer className="size-3.5 text-ink-muted" aria-hidden /> Print / Save as PDF
              </button>
            </div>
          )}
        </div>
      )}

      {role === "assistant" && onRegenerate && (
        <IconButton
          label="Regenerate"
          onClick={() => {
            if (canRegenerate !== false) onRegenerate();
          }}
        >
          <RotateCcw className="size-3.5" />
        </IconButton>
      )}

      {role === "user" && onEdit && (
        <IconButton label="Edit message" onClick={() => onEdit(text)}>
          <Pencil className="size-3.5" />
        </IconButton>
      )}

      {at && (
        <span className="ml-auto shrink-0 pl-2 font-mono text-[10px] text-ink-muted/80">
          {stamp(at)}
        </span>
      )}
    </div>
  );
}

/** Inline editor for a question that re-runs the conversation. */
export function EditMessageForm({
  initial,
  onCancel,
  onSave,
}: {
  initial: string;
  onCancel: () => void;
  onSave: (next: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-full rounded-xl border border-line bg-surface p-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={3}
        autoFocus
        className="block max-h-48 w-full resize-none bg-transparent px-1 py-1 text-[13px] leading-relaxed text-ink outline-none"
      />
      <div className="mt-1 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer rounded-md px-2 py-1 text-[11.5px] text-ink-muted hover:bg-paper hover:text-ink"
        >
          <X className="mr-1 inline size-3" aria-hidden />
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={!value.trim()}
          className="cursor-pointer rounded-md bg-ink px-2.5 py-1 text-[11.5px] text-paper disabled:opacity-40"
        >
          Save &amp; resend
        </button>
      </div>
    </div>
  );
}

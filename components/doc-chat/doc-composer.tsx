"use client";

import { ArrowUp, Lock } from "lucide-react";
import { useEffect } from "react";

import { useComposer } from "@/components/chat/use-composer";

/**
 * The reader's own composer: one row, pinned under the page.
 *
 * Gloss's proportions, not `/chat`'s: a single line that grows to three, a
 * round send button, and the document it is asking about stated on the left as a
 * lock rather than a picker. The scope is not a choice here — that is what makes
 * the first message a new conversation *about this document*.
 *
 * Sending starts a new chat; it never appends to the one already in the panel.
 * That one has its own composer, inside the panel.
 */
export function DocComposer({
  docName,
  disabled,
  onSend,
}: {
  docName: string;
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  const { value, attach, onChange, onKeyDown, submit, focus } = useComposer({ onSubmit: onSend, disabled });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  return (
    <div className="shrink-0 border-t border-line bg-paper/85 px-3 py-2 backdrop-blur sm:px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <form
        className="mx-auto w-full max-w-3xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-end gap-1.5 rounded-[16px] border border-line bg-surface px-2 py-1.5 shadow-sm transition-colors focus-within:border-ink/30">
          <span
            className="mb-1 hidden shrink-0 items-center gap-1 rounded-md bg-paper px-1.5 py-1 text-[10.5px] leading-none text-ink-muted sm:flex"
            title={`Scoped to ${docName}`}
          >
            <Lock className="size-2.5" aria-hidden />
            <span className="max-w-[150px] truncate">{docName.replace(/\.pdf$/i, "")}</span>
          </span>

          <textarea
            ref={attach}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={
              disabled ? "Available once indexing finishes" : "Ask about this document…"
            }
            aria-label="Ask about this document"
            className="max-h-24 min-h-[34px] min-w-0 flex-1 resize-none bg-transparent px-1 py-1.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-ink-muted/70 disabled:cursor-not-allowed"
          />

          <button
            type="submit"
            disabled={disabled || !value.trim()}
            aria-label="Send question"
            className="mb-0.5 grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-paper transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowUp className="size-4" aria-hidden />
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { cn } from "@/components/ui-kit";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Promise-based confirm dialog, replacing `window.confirm`.
 *
 *   const ok = await confirm({ title: "Delete document?", tone: "danger" });
 */
export function useConfirm(): ConfirmContextValue["confirm"] {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used within ConfirmProvider");
  return value.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { id: number }) | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirmButton = useRef<HTMLButtonElement | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setRequest({ ...options, id: Date.now() });
      }),
    [],
  );

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  }, []);

  useEffect(() => {
    if (!request) return;
    confirmButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        settle(false);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        settle(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, settle]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {request && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) settle(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="pi-confirm-title"
            className="w-full max-w-sm overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
          >
            <div className="px-4 py-3.5">
              <h2 id="pi-confirm-title" className="text-[14px] font-medium text-ink">
                {request.title}
              </h2>
              {request.description && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
                  {request.description}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-line bg-paper/60 px-3 py-2.5">
              <button
                type="button"
                onClick={() => settle(false)}
                className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] text-ink transition-colors hover:bg-paper"
              >
                {request.cancelLabel ?? "Cancel"}
              </button>
              <button
                ref={confirmButton}
                type="button"
                onClick={() => settle(true)}
                className={cn(
                  "cursor-pointer rounded-lg px-3 py-1.5 text-[12px] text-paper transition-opacity hover:opacity-90",
                  request.tone === "danger" ? "bg-red-600" : "bg-ink",
                )}
              >
                {request.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

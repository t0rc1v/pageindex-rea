"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
 *
 * The surface is shadcn's AlertDialog, the same component folder and chat
 * deletion use. Keeping the promise API means destructive call sites stay a
 * simple `if (!(await confirm(...))) return`, while focus management, Escape /
 * backdrop handling and the destructive button treatment come from Base UI.
 *
 * Cancel is the first focusable control — an accidental Enter never confirms a
 * destructive action.
 */
export function useConfirm(): ConfirmContextValue["confirm"] {
  const value = useContext(ConfirmContext);
  if (!value) throw new Error("useConfirm must be used within ConfirmProvider");
  return value.confirm;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<(ConfirmOptions & { id: number }) | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // A second request replaces the first; never leave its caller hanging.
        resolver.current?.(false);
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

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <AlertDialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        {request && (
          <AlertDialogContent key={request.id}>
            <AlertDialogHeader>
              <AlertDialogTitle>{request.title}</AlertDialogTitle>
              {request.description && (
                <AlertDialogDescription>{request.description}</AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{request.cancelLabel ?? "Cancel"}</AlertDialogCancel>
              <AlertDialogAction
                variant={request.tone === "danger" ? "destructive" : "default"}
                onClick={() => settle(true)}
              >
                {request.confirmLabel ?? "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

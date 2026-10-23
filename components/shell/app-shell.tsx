"use client";

import { Suspense, type ReactNode } from "react";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "./sidebar";

/**
 * App frame.
 *
 * shadcn's SidebarProvider owns the collapse state (cookie-backed, ⌘/Ctrl+B) and
 * swaps in a Sheet on mobile; SidebarInset is the content column beside it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        {/* The sidebar reads the active path, so it streams in instead of
            blocking prerendering of the shell. */}
        <Suspense
          fallback={
            <div className="hidden w-64 shrink-0 border-r border-line bg-surface md:block" />
          }
        >
          <AppSidebar />
        </Suspense>
        <SidebarInset className="flex min-h-0 flex-col overflow-hidden bg-paper">
          <header className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-surface/70 px-2 backdrop-blur">
            <SidebarTrigger className="text-ink-muted hover:text-ink" />
            <span className="text-[11px] uppercase tracking-[0.14em] text-ink-muted">
              Co-reader
            </span>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

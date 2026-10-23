"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";

/** Theme / transcript preferences, persisted per browser. */
export interface Appearance {
  theme: "light" | "dark" | "system";
  /** The transcript's typeface: the reading identity, or the official's sans. */
  transcript: "serif" | "sans";
  density: "comfortable" | "compact";
}

const DEFAULT_APPEARANCE: Appearance = {
  theme: "light",
  transcript: "serif",
  density: "comfortable",
};

const STORAGE_KEY = "pageindex-reader/appearance";

interface AppearanceContextValue {
  appearance: Appearance;
  setAppearance: (patch: Partial<Appearance>) => void;
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function readAppearance(): Appearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    return { ...DEFAULT_APPEARANCE, ...(JSON.parse(raw) as Partial<Appearance>) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function useAppearance(): AppearanceContextValue {
  const value = useContext(AppearanceContext);
  if (!value) throw new Error("useAppearance must be used within AppProviders");
  return value;
}

function AppearanceProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setState] = useState<Appearance>(readAppearance);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark =
        appearance.theme === "dark" || (appearance.theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
      root.dataset.transcript = appearance.transcript;
      root.dataset.density = appearance.density;
      // Let sonner and the page chrome follow the resolved theme.
      root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
    if (appearance.theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [appearance]);

  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    setState((previous) => ({ ...previous, ...patch }));
  }, []);

  const value = useMemo(() => ({ appearance, setAppearance }), [appearance, setAppearance]);

  return (
    <AppearanceContext.Provider value={value}>
      {children}
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        toastOptions={{ className: "!font-sans !text-[13px]" }}
      />
    </AppearanceContext.Provider>
  );
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <AppearanceProvider>{children}</AppearanceProvider>
    </QueryClientProvider>
  );
}

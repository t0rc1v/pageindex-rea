"use client";

import { useSyncExternalStore } from "react";

/**
 * A viewport check as a subscription rather than state written from an effect:
 * the same reason `useIsMobile` is built this way, and what the React Compiler
 * lint rules want instead of `setState` inside `useEffect`.
 *
 * The server has no viewport, so it answers `false` — callers must treat that as
 * "not yet known" and pick a layout that survives the first client paint.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

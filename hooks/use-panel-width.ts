"use client";

import { useCallback, useRef, useState, useSyncExternalStore } from "react";

/**
 * A draggable panel width, remembered between visits.
 *
 * The stored value is read through `useSyncExternalStore` rather than an effect:
 * the server has no localStorage, so the first paint uses the default and the
 * client switches to the stored width after hydration — without a hydration
 * mismatch, and without `setState` inside an effect (which the compiler lint
 * rejects, and which is the wrong shape anyway).
 *
 * During a drag the live width lives in state; it is written to storage once the
 * pointer is released, so a drag does not hammer localStorage.
 */
export interface PanelWidth {
  width: number;
  min: number;
  max: number;
  /** Apply to the panel element; the panel consumes it at its docked breakpoint. */
  style: React.CSSProperties;
  dragging: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function readStored(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    const value = Number(raw);
    return raw !== null && Number.isFinite(value) ? value : null;
  } catch {
    // Private mode or a disabled store: the panel simply keeps the default.
    return null;
  }
}

function writeStored(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* layout preference, not state — losing it is fine */
  }
}

export function usePanelWidth({
  storageKey,
  min,
  max,
  initial,
  step = 16,
}: {
  storageKey: string;
  min: number;
  max: number;
  initial: number;
  step?: number;
}): PanelWidth {
  const stored = useSyncExternalStore(
    // Same-tab writes already re-render through state; this is for other tabs.
    (onChange) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === storageKey) onChange();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    () => readStored(storageKey),
    () => null,
  );

  const [dragging, setDragging] = useState(false);
  const [live, setLive] = useState<number | null>(null);
  const rest = clamp(stored ?? initial, min, max);
  const width = clamp(live ?? rest, min, max);

  const frame = useRef<number | null>(null);
  const latest = useRef<number>(width);

  const commit = useCallback(
    (next: number) => {
      const value = clamp(next, min, max);
      latest.current = value;
      writeStored(storageKey, value);
      setLive(null);
    },
    [max, min, storageKey],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();

      const panel = event.currentTarget.parentElement;
      if (!panel) return;

      const startX = event.clientX;
      const startWidth = panel.getBoundingClientRect().width;

      setDragging(true);

      const onMove = (move: PointerEvent) => {
        // The handle sits on the panel's left edge: moving left grows the panel.
        const next = clamp(startWidth - (move.clientX - startX), min, max);
        latest.current = next;
        setLive(next);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        setDragging(false);
        commit(latest.current);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [commit, max, min],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const current = latest.current;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        commit(current + step);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        commit(current - step);
      } else if (event.key === "Home") {
        event.preventDefault();
        commit(initial);
      }
    },
    [commit, initial, step],
  );

  return {
    width,
    min,
    max,
    style: { "--panel-width": `${width}px` } as React.CSSProperties,
    dragging,
    onPointerDown,
    onKeyDown,
  };
}

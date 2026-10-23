"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals streamed text a few characters at a time.
 *
 * Only ever called with the *stable* text (the partial citation tail is held
 * back by `splitStreamingTail`), so the effect can never paint half a tag.
 */
export function useTypewriter(text: string, enabled: boolean): string {
  const [shown, setShown] = useState(() => (enabled ? 0 : text.length));
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || shown >= text.length) return;
    frame.current = requestAnimationFrame(() => {
      setShown((current) => {
        const remaining = text.length - current;
        // Catch up quickly on long runs so the reveal never lags the stream.
        const step = Math.max(2, Math.ceil(remaining / 10));
        return Math.min(text.length, current + step);
      });
    });
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [enabled, shown, text.length]);

  return enabled ? text.slice(0, Math.min(shown, text.length)) : text;
}

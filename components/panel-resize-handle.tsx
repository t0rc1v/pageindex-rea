"use client";

import { cn } from "@/components/ui-kit";

/**
 * The grip on a docked panel's left edge.
 *
 * Pointer drag and arrow keys drive the same width, so the layout is reachable
 * without a mouse. `aria-valuenow` is the width in pixels, which is the value
 * the arrows change.
 */
export function PanelResizeHandle({
  label,
  width,
  min,
  max,
  onPointerDown,
  onKeyDown,
  className,
}: {
  label: string;
  width: number;
  min: number;
  max: number;
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  className?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize touch-none transition-colors",
        "hover:bg-brand/30 focus-visible:bg-brand/40 focus-visible:outline-none",
        className,
      )}
    />
  );
}

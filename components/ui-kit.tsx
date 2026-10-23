"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

import { ApiError } from "@/lib/client/api";
import { statusLabel } from "@/lib/format";

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-paper hover:bg-ink/90 border border-ink shadow-[0_1px_0_rgba(0,0,0,0.04)]",
  secondary:
    "bg-surface text-ink border border-line hover:border-ink/30 hover:bg-paper",
  ghost: "bg-transparent text-ink-muted border border-transparent hover:bg-ink/5 hover:text-ink",
  danger:
    "bg-transparent text-red-700 border border-red-200 hover:bg-red-50 hover:border-red-300",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-45",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink/40",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block size-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent",
        className,
      )}
    />
  );
}

export function StatusBadge({ status }: { status: string | undefined }) {
  const tone =
    status === "completed"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : status === "failed"
        ? "bg-red-50 text-red-800 border-red-200"
        : status === "processing"
          ? "bg-amber-50 text-amber-900 border-amber-200"
          : "bg-ink/5 text-ink-muted border-line";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tone,
      )}
    >
      {(status === "processing" || status === "queued") && (
        <Spinner className="size-2.5" />
      )}
      {statusLabel(status)}
    </span>
  );
}

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(23,22,21,0.04)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ErrorPanel({
  error,
  onRetry,
  compact,
}: {
  error: ApiError;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-red-200 bg-red-50/70 text-red-900",
        compact ? "p-3 text-[13px]" : "p-4 text-sm",
      )}
    >
      <p className="font-medium">
        {error.isMissingKey ? "PageIndex API key needed" : "Request failed"}
      </p>
      <p className="mt-1 leading-relaxed opacity-90">{error.message}</p>
      {error.isMissingKey && (
        <p className="mt-2 text-[12px] leading-relaxed opacity-80">
          Create a key at dash.pageindex.ai, then put{" "}
          <code className="rounded bg-white/70 px-1 py-0.5 font-mono text-[11px]">
            PAGEINDEX_API_KEY=...
          </code>{" "}
          in <code className="font-mono text-[11px]">.env.local</code> and restart
          the dev server.
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 cursor-pointer text-[12px] font-medium underline underline-offset-2"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-ink/8", className)} />;
}

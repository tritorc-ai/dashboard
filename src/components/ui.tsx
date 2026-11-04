"use client";

import { useEffect, type ButtonHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/types";
import { PLATFORM_COLOR } from "@/lib/filters";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow)] sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md";
};

export function Button({ className, variant = "outline", size = "md", ...props }: BtnProps) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg border text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5" : "h-9 px-3.5",
        variant === "primary" && "border-brand bg-brand text-white hover:opacity-90",
        variant === "outline" && "border-line bg-surface hover:bg-surface-2",
        variant === "ghost" && "border-transparent hover:bg-surface-2",
        className,
      )}
    />
  );
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 rounded-lg border border-line bg-surface px-2.5 text-sm outline-none hover:border-muted focus-visible:border-brand",
        className,
      )}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn" | "brand";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        tone === "neutral" && "bg-surface-2 text-muted",
        tone === "good" && "bg-good/12 text-good",
        tone === "bad" && "bg-bad/12 text-bad",
        tone === "warn" && "bg-warn/15 text-warn",
        tone === "brand" && "bg-brand-soft text-brand",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PlatformDot({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ background: PLATFORM_COLOR[platform] }}
    />
  );
}

export function PlatformTag({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <PlatformDot platform={platform} />
      {platform}
    </span>
  );
}

export function Delta({
  value,
  inverse,
  className,
}: {
  value: number | null;
  inverse?: boolean;
  className?: string;
}) {
  if (value == null)
    return (
      <span className={cn("inline-flex items-center gap-0.5 text-xs text-muted", className)}>
        <Minus className="size-3" /> no comparison
      </span>
    );
  const up = value >= 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular",
        good ? "text-good" : "text-bad",
        className,
      )}
    >
      <Icon className="size-3.5" />
      {Math.abs(value).toFixed(value > -10 && value < 10 ? 1 : 0)}%
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            o.value === value ? "bg-brand text-white" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-24 place-items-center rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
      {children}
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col border-l border-line bg-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-line bg-surface px-5 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close panel">
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** Horizontal bar list used for "by format / category / product" breakdowns. */
export function BarList({
  items,
  format,
  color = "var(--brand)",
}: {
  items: { label: string; value: number | null; sub?: string }[];
  format: (n: number) => string;
  color?: string;
}) {
  const rows = items.filter((i) => i.value != null) as { label: string; value: number; sub?: string }[];
  rows.sort((a, b) => b.value - a.value);
  const max = Math.max(...rows.map((r) => r.value), 1e-9);
  if (!rows.length) return <Empty>No data for this selection</Empty>;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={r.label}>
            {r.label}
            {r.sub && <span className="ml-1 text-xs text-muted">{r.sub}</span>}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, background: color }}
            />
          </span>
          <span className="tabular w-16 text-right font-medium">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}

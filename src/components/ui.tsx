"use client";

// Shared UI primitives on the design tokens in globals.css (bg/surface/line/text/muted + verdict colours).
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import type { RedFlag, Verdict } from "@/lib/shield/types";
import { IconAlert, IconBan, IconCheck } from "./icons";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export const VERDICT: Record<Verdict, { label: string; word: string; text: string; bg: string; border: string; solid: string; Icon: typeof IconCheck }> = {
  APPLY: { label: "Apply", word: "Go for it", text: "text-apply", bg: "bg-apply-soft", border: "border-apply/40", solid: "bg-apply text-bg", Icon: IconCheck },
  CAUTION: { label: "Caution", word: "Be careful", text: "text-caution", bg: "bg-caution-soft", border: "border-caution/40", solid: "bg-caution text-bg", Icon: IconAlert },
  AVOID: { label: "Avoid", word: "Skip it", text: "text-avoid", bg: "bg-avoid-soft", border: "border-avoid/40", solid: "bg-avoid text-bg", Icon: IconBan },
};

export const SEVERITY: Record<RedFlag["severity"], { label: string; cls: string }> = {
  critical: { label: "Critical", cls: "bg-avoid text-bg" },
  high: { label: "High", cls: "bg-avoid-soft text-avoid ring-1 ring-inset ring-avoid/40" },
  medium: { label: "Medium", cls: "bg-caution-soft text-caution ring-1 ring-inset ring-caution/40" },
  low: { label: "Low", cls: "bg-surface-2 text-muted ring-1 ring-inset ring-line-strong" },
};

/** Verdict pill: colour + icon + word, so colour is never the only signal. */
export function VerdictPill({ verdict, size = "sm" }: { verdict: Verdict; size?: "sm" | "lg" }) {
  const v = VERDICT[verdict];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide", v.bg, v.text, size === "lg" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-[11px]")}>
      <v.Icon size={size === "lg" ? 16 : 12} strokeWidth={2.5} />
      {v.label}
    </span>
  );
}

export function Card({ title, action, children, className, icon }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <section className={cx("surface rounded-2xl p-5", className)}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2">
          {title && (
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              {icon}
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg" }) {
  const styles = {
    primary: "bg-text text-bg hover:opacity-90",
    secondary: "border border-line-strong bg-surface text-text hover:border-muted",
    ghost: "text-muted hover:bg-surface-2 hover:text-text",
    danger: "text-avoid hover:bg-avoid-soft",
  }[variant];
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" }[size];
  return (
    <button
      className={cx("inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:cursor-not-allowed disabled:opacity-45", styles, sizes, className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "h-10 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-text outline-none transition placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand-soft",
        className,
      )}
      {...props}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="num rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted">{children}</kbd>;
}

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center rounded-2xl px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">{icon}</div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{children}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="rise flex items-start gap-3 rounded-2xl border border-avoid/30 bg-avoid-soft p-4 text-sm">
      <IconAlert className="mt-0.5 shrink-0 text-avoid" />
      <div className="flex-1 text-text">{children}</div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts up from 0 once mounted (instant with reduced motion). */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString("en-US"), duration = 800 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const reduce = prefersReducedMotion();
    const tick = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - start) / duration);
      setShown(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <span className="num">{format(shown)}</span>;
}

/** Circular gauge 0–100 in the verdict colour; the arc fills on mount. */
export function Gauge({ value, verdict, size = 96 }: { value: number; verdict: Verdict; size?: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Trust score ${value} out of 100`}>
      <svg viewBox="0 0 100 100" width={size} height={size} className="-rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="7" className={cx(VERDICT[verdict].text, "opacity-15")} />
        <circle
          className={cx("gauge-arc", VERDICT[verdict].text)}
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ ["--gauge-c" as string]: c }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold leading-none">
          <CountUp value={value} duration={900} />
        </span>
        <span className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted">trust</span>
      </div>
    </div>
  );
}

export const usd = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

export function daysLeftNumber(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
}

export function daysLeft(iso: string | null): string {
  const d = daysLeftNumber(iso);
  if (d == null) return "no deadline";
  if (d < 0) return "closed";
  if (d === 0) return "closes today";
  return `${d} day${d === 1 ? "" : "s"} left`;
}

export const PLATFORM_LABEL: Record<string, string> = { github: "GitHub", superteam: "Superteam Earn", devpost: "Devpost", web: "Web" };

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-xl border border-line bg-surface p-1 text-sm">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cx("rounded-lg px-3 py-1.5 transition", value === o.id ? "bg-text text-bg" : "text-muted hover:text-text")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

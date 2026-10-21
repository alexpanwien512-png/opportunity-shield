// Small shared UI primitives. Tailwind only; colors follow the verdict/severity semantics.
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import type { RedFlag, Verdict } from "@/lib/shield/types";

export const VERDICT_STYLE: Record<Verdict, { label: string; tone: string; solid: string; dot: string; icon: string }> = {
  APPLY: { label: "Apply", tone: "border-emerald-500/30 bg-emerald-500/[0.06]", solid: "bg-emerald-600 text-white", dot: "bg-emerald-500", icon: "✓" },
  CAUTION: { label: "Caution", tone: "border-amber-500/40 bg-amber-500/[0.07]", solid: "bg-amber-500 text-amber-950", dot: "bg-amber-500", icon: "!" },
  AVOID: { label: "Avoid", tone: "border-rose-500/30 bg-rose-500/[0.06]", solid: "bg-rose-600 text-white", dot: "bg-rose-500", icon: "✕" },
};

export const SEVERITY_STYLE: Record<RedFlag["severity"], string> = {
  critical: "bg-rose-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-400 text-amber-950",
  low: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const v = VERDICT_STYLE[verdict];
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", v.solid)}>{v.icon} {v.label}</span>;
}

export function Card({ title, action, children, className }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/[0.02] dark:border-zinc-800 dark:bg-zinc-900/60", className)}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
    secondary: "border border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-500",
    ghost: "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
    danger: "text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950",
  }[variant];
  return (
    <button
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50", styles, className)}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        "w-full min-w-0 rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/5 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300 dark:focus:ring-white/5",
        className,
      )}
      {...props}
    />
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">{children}</div>;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200">{children}</div>;
}

export const usd = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;

export function daysLeft(iso: string | null): string {
  if (!iso) return "no deadline";
  const d = Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000);
  if (d < 0) return "closed";
  if (d === 0) return "closes today";
  return `${d} day${d === 1 ? "" : "s"} left`;
}

export const PLATFORM_LABEL: Record<string, string> = { github: "GitHub", superteam: "Superteam Earn", devpost: "Devpost", web: "Web" };

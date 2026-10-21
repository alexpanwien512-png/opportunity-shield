"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { IconLink, IconSparkle, IconUser, IconX } from "./icons";

const KEY = "onboarded-v1";
const listeners = new Set<() => void>();
const read = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true;
  }
};
export function dismissOnboarding() {
  try {
    localStorage.setItem(KEY, "1");
  } catch {}
  listeners.forEach((l) => l());
}

const STEPS = [
  { Icon: IconUser, title: "Tell it who you are", body: "Country, skills and your hourly rate. Eligibility is personal.", href: "/profile", cta: "Set profile" },
  { Icon: IconLink, title: "Paste a link", body: "A hackathon, a Superteam bounty or a GitHub issue." },
  { Icon: IconSparkle, title: "Read the verdict", body: "Apply, Caution or Avoid — every red flag comes with a quote." },
];

/** First-visit guide: three short steps, closable with ✕ or Esc, never shown again. */
export function Onboarding() {
  const done = useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    read,
    // Render it on the server (first visits are the common case for this page): no layout shift on load.
    () => false,
  );
  useEffect(() => {
    if (done) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && dismissOnboarding();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done]);
  if (done) return null;

  return (
    <section aria-label="How it works" className="surface rise relative mt-8 rounded-2xl p-5">
      <button onClick={dismissOnboarding} className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text" aria-label="Close the guide">
        <IconX size={16} />
      </button>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">How it works</p>
      <ol className="mt-3 grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ Icon, title, body, href, cta }, i) => (
          <li key={title} className="flex gap-3">
            <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-sm font-semibold text-brand">{i + 1}</span>
            <div>
              <p className="flex items-center gap-1.5 font-medium">
                <Icon size={15} className="text-muted" /> {title}
              </p>
              <p className="mt-0.5 text-sm text-muted">{body}</p>
              {href && (
                <Link href={href} className="mt-1.5 inline-block rounded text-sm font-medium text-brand hover:underline">
                  {cta} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

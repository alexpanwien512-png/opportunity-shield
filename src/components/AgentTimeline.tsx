"use client";

import { useEffect, useState } from "react";
import type { ProgressStep } from "@/lib/shield/types";
import { IconCheck } from "./icons";
import { cx } from "./ui";

export type StepState = { status: "pending" | "active" | "done" | "skipped"; detail?: string; ms?: number; startedAt?: number };
export type Timeline = Record<ProgressStep, StepState>;

export const STEP_ORDER: ProgressStep[] = ["fetch", "extract", "eligibility", "flags", "verdict"];

export function emptyTimeline(): Timeline {
  return { fetch: { status: "pending" }, extract: { status: "pending" }, eligibility: { status: "pending" }, flags: { status: "pending" }, verdict: { status: "pending" } };
}

function label(step: ProgressStep, country: string) {
  return {
    fetch: "Fetching page via Tavily",
    extract: "Extracting facts · Nemotron 3.5 Lightning",
    eligibility: `Checking eligibility for ${country}`,
    flags: "Hunting red flags",
    verdict: "Final verdict · Nemotron 3 Ultra",
  }[step];
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  return <span className="num text-brand">{((now - since) / 1000).toFixed(1)}s</span>;
}

/** The agent's work, step by step, as it happens (driven by streamed progress events). */
export function AgentTimeline({ timeline, country, fromMemory }: { timeline: Timeline; country: string; fromMemory?: boolean }) {
  return (
    <ol className="surface rise relative overflow-hidden rounded-2xl p-5" aria-label="Analysis progress" aria-live="polite">
      {fromMemory && <li className="mb-3 text-xs text-muted">Loaded from memory — analyzed recently with the same profile and rules.</li>}
      {STEP_ORDER.map((step, i) => {
        const s = timeline[step];
        const last = i === STEP_ORDER.length - 1;
        return (
          <li key={step} className="relative flex gap-3 pb-4 last:pb-0">
            {!last && <span aria-hidden className={cx("absolute left-[11px] top-6 h-[calc(100%-12px)] w-px", s.status === "done" ? "bg-brand/60" : "bg-line")} />}
            <span
              aria-hidden
              className={cx(
                "relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] transition",
                s.status === "done" && "border-brand bg-brand text-bg",
                s.status === "active" && "border-brand text-brand",
                s.status === "skipped" && "border-caution text-caution",
                s.status === "pending" && "border-line-strong text-faint",
              )}
            >
              {s.status === "done" ? <IconCheck size={13} strokeWidth={3} /> : s.status === "active" ? <span className="spin h-3 w-3 rounded-full border-2 border-brand border-t-transparent" /> : s.status === "skipped" ? "!" : <span className="num">{i + 1}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cx("text-sm font-medium", s.status === "pending" ? "text-faint" : "text-text")}>{label(step, country)}</span>
                <span className="shrink-0 text-xs text-muted">
                  {s.status === "active" && s.startedAt ? <Elapsed since={s.startedAt} /> : s.ms != null ? <span className="num">{(s.ms / 1000).toFixed(1)}s</span> : null}
                </span>
              </div>
              {s.detail && <p className="mt-0.5 truncate text-xs text-muted">{s.detail}</p>}
              {s.status === "active" && <div className="shimmer mt-2 h-1 rounded-full" />}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

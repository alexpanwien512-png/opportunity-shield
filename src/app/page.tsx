"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AgentTimeline, emptyTimeline, STEP_ORDER, type Timeline } from "@/components/AgentTimeline";
import { announce } from "@/components/Emblem";
import { IconArrow, IconCode, IconLink, IconSparkle, IconTrophy } from "@/components/icons";
import { NetworkField } from "@/components/NetworkField";
import { Onboarding, dismissOnboarding } from "@/components/Onboarding";
import { Report, type ReportData } from "@/components/Report";
import { ErrorBox, Kbd, VERDICT, VerdictPill, cx, daysLeft } from "@/components/ui";
import type { HistoryItem } from "@/lib/shield/store";
import type { ProgressEvent, Verdict } from "@/lib/shield/types";

const EXAMPLES: { label: string; hint: string; url: string; expect: Verdict; Icon: typeof IconCode }[] = [
  { label: "$430 to write a poem", hint: "GitHub · star-farm repo", url: "https://github.com/SecureBananaLabs/bug-bounty/issues/76", expect: "AVOID", Icon: IconCode },
  { label: "“Test bounty”, pay by DM", hint: "GitHub · $50 typo fix", url: "https://github.com/jomaaabbe78-spec/bookningsapp/issues/1", expect: "AVOID", Icon: IconCode },
  { label: "Travel boost, Germany only", hint: "Superteam Earn · regional", url: "https://superteam.fun/earn/listing/travel-boost-for-bp26", expect: "AVOID", Icon: IconSparkle },
  { label: "4,000 USDC audit “grants”", hint: "Superteam Earn · not cash", url: "https://superteam.fun/earn/listing/vaultline-security-audit-grants-for-colosseum-projects-up-to-4000-usdc-each", expect: "AVOID", Icon: IconSparkle },
  { label: "Write a $CHIMP thread", hint: "Superteam Earn · token promo", url: "https://superteam.fun/earn/listing/chimp-on-metaplex", expect: "CAUTION", Icon: IconSparkle },
  { label: "Nebius x NVIDIA hackathon", hint: "Devpost · $50k cash", url: "https://nebiusglobalaihackathon.devpost.com", expect: "APPLY", Icon: IconTrophy },
];

type Phase = "idle" | "running" | "done" | "error";

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [timeline, setTimeline] = useState<Timeline>(emptyTimeline);
  const [fromMemory, setFromMemory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [country, setCountry] = useState("your country");
  const input = useRef<HTMLInputElement>(null);
  const lastUrl = useRef("");

  const loadHistory = useCallback(() => {
    fetch("/api/history")
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {});
  }, []);

  const analyze = useCallback(
    async (target: string, force = false) => {
      const clean = target.trim();
      if (!clean) return;
      lastUrl.current = clean;
      setUrl(clean);
      setPhase("running");
      setError(null);
      setResult(null);
      setFromMemory(false);
      setTimeline(emptyTimeline());
      dismissOnboarding();
      announce({ mode: "busy" });
      window.scrollTo({ top: 0, behavior: "smooth" });

      const apply = (e: ProgressEvent) =>
        setTimeline((t) => ({
          ...t,
          [e.step]: {
            status: e.status === "start" ? "active" : e.status,
            detail: e.detail ?? t[e.step].detail,
            ms: e.ms,
            startedAt: e.status === "start" ? Date.now() : t[e.step].startedAt,
          },
        }));

      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
          body: JSON.stringify({ url: clean, force }),
        });
        if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Something went wrong. Try again in a minute.");
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let final: ReportData | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const msg = JSON.parse(line);
            if (msg.type === "progress") apply(msg);
            if (msg.type === "error") throw new Error(msg.error);
            if (msg.type === "result") final = msg.result;
          }
        }
        if (!final) throw new Error("The analysis stopped before finishing. Try again.");
        if (final.cached) {
          // Served from memory: fill the timeline quickly so the steps still read clearly.
          setFromMemory(true);
          for (const step of STEP_ORDER) {
            setTimeline((t) => ({ ...t, [step]: { status: "done", detail: "from memory" } }));
            await new Promise((r) => setTimeout(r, 90));
          }
        }
        setResult(final);
        setPhase("done");
        announce({ mode: "verdict", verdict: final.verdict });
        loadHistory();
      } catch (err) {
        const msg = err instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : (err as Error).message;
        setError(msg);
        setPhase("error");
        announce({ mode: "idle" });
      }
    },
    [loadHistory],
  );

  useEffect(() => {
    loadHistory();
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => setCountry(d.profile?.residenceCountry ?? "your country"))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    const linked = params.get("url");
    // Deep links from Scan / Memory: /?url=… opens that analysis (instant when cached).
    const deferred = linked ? setTimeout(() => analyze(linked), 0) : undefined;
    if (!linked) input.current?.focus();
    const focus = () => {
      input.current?.focus();
      input.current?.select();
    };
    window.addEventListener("shield:focus", focus);
    if (params.get("focus")) focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && document.activeElement === input.current) input.current?.blur();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(deferred);
      window.removeEventListener("shield:focus", focus);
      window.removeEventListener("keydown", onKey);
      announce({ mode: "idle" });
    };
  }, [analyze, loadHistory]);

  function reset() {
    setPhase("idle");
    setResult(null);
    setError(null);
    setUrl("");
    announce({ mode: "idle" });
  }

  const compact = phase !== "idle";

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        analyze(url);
      }}
      className={cx("surface flex items-center gap-2 rounded-2xl p-2 transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand-soft", compact ? "" : "sm:p-2.5")}
      role="search"
    >
      <IconLink className="ml-2 shrink-0 text-muted" size={compact ? 18 : 20} />
      <label htmlFor="url" className="sr-only">
        Opportunity link
      </label>
      <input
        id="url"
        data-own-ring
        ref={input}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        inputMode="url"
        autoComplete="off"
        spellCheck={false}
        placeholder="Paste a hackathon, bounty or GitHub issue link…"
        className={cx("min-w-0 flex-1 bg-transparent text-text outline-none placeholder:text-faint", compact ? "h-10 text-sm" : "h-12 text-base sm:h-14 sm:text-lg")}
      />
      <button
        type="submit"
        disabled={phase === "running" || !url.trim()}
        aria-label={phase === "running" ? "Analyzing" : "Analyze"}
        className={cx(
          "inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-text font-medium text-bg transition hover:opacity-90 disabled:bg-surface-2 disabled:text-muted disabled:ring-1 disabled:ring-inset disabled:ring-line",
          compact ? "h-10 px-3 text-sm sm:px-4" : "h-12 px-4 sm:h-14 sm:px-6",
        )}
      >
        <span className="hidden min-[440px]:inline">{phase === "running" ? "Analyzing…" : "Analyze"}</span> <IconArrow size={16} />
      </button>
    </form>
  );

  return (
    <div>
      {!compact ? (
        <section className="relative -mx-4 -mt-8 overflow-hidden px-4 pb-6 pt-14 sm:-mt-12 sm:pt-24">
          <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_35%,transparent_75%)]">
            <NetworkField />
          </div>
          <div className="relative mx-auto max-w-2xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs text-muted backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" /> Personal AI agent · Nemotron on Nebius · Tavily
            </p>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Is this opportunity <span className="text-brand">worth your time</span>?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-muted sm:text-lg">
              Paste a link. The shield checks if you&apos;re eligible, what the prize really is, and exposes the traps — every claim backed by a quote.
            </p>
            <div className="mt-8 text-left">{form}</div>
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
              <Kbd>Enter</Kbd> analyze <span aria-hidden>·</span> <Kbd>⌘K</Kbd> focus
            </p>
          </div>
        </section>
      ) : (
        <div className="sticky top-14 z-20 -mx-4 bg-bg/85 px-4 py-3 backdrop-blur-md">{form}</div>
      )}

      {phase === "idle" && (
        <>
          <Onboarding />
          <section aria-labelledby="examples-title" className="mt-10">
            <h2 id="examples-title" className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              Try a real case
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {EXAMPLES.map((ex, i) => (
                <li key={ex.url} className="rise" style={{ animationDelay: `${i * 50}ms` }}>
                  <button
                    onClick={() => analyze(ex.url)}
                    className="surface flex h-full w-full items-start gap-3 rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:border-line-strong"
                  >
                    <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", VERDICT[ex.expect].bg, VERDICT[ex.expect].text)}>
                      <ex.Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">{ex.label}</span>
                      <span className="mt-0.5 block text-xs text-muted">{ex.hint}</span>
                    </span>
                    <VerdictPill verdict={ex.expect} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {history.length > 0 && (
            <section aria-labelledby="recent-title" className="mt-10">
              <h2 id="recent-title" className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                Your recent analyses
              </h2>
              <ul className="surface divide-y divide-line overflow-hidden rounded-2xl">
                {history.slice(0, 6).map((h) => (
                  <li key={h.url}>
                    <button onClick={() => analyze(h.url)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-surface-2">
                      <VerdictPill verdict={h.verdict} />
                      <span className="min-w-0 flex-1 truncate">{h.title}</span>
                      <span className="hidden shrink-0 text-xs text-muted sm:inline">{daysLeft(h.deadline)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {compact && (
        <div className="mt-4 grid gap-4">
          {phase !== "done" && <AgentTimeline timeline={timeline} country={country} fromMemory={fromMemory} />}
          {error && <ErrorBox onRetry={() => analyze(lastUrl.current)}>{error}</ErrorBox>}
          {result && phase === "done" && (
            <>
              <Report r={result} onReanalyze={() => analyze(result.url, true)} />
              <details className="surface rounded-2xl px-5 py-3 text-sm">
                <summary className="cursor-pointer text-muted">How the agent got here</summary>
                <div className="mt-3">
                  <AgentTimeline timeline={timeline} country={country} fromMemory={fromMemory} />
                </div>
              </details>
            </>
          )}
          {phase !== "running" && (
            <button onClick={reset} className="mx-auto rounded-lg px-3 py-1.5 text-sm text-muted hover:text-text">
              ← Analyze something else
            </button>
          )}
        </div>
      )}
    </div>
  );
}

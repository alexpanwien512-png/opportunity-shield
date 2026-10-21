"use client";

import { useEffect, useState } from "react";
import { Report, type ReportData } from "@/components/Report";
import { Button, ErrorBox, Input, VERDICT_STYLE, cx, daysLeft } from "@/components/ui";
import type { HistoryItem } from "@/lib/shield/store";

const EXAMPLES = [
  { label: "Star-farm poem bounty", url: "https://github.com/SecureBananaLabs/bug-bounty/issues/76" },
  { label: "Test bounty, pay by DM", url: "https://github.com/jomaaabbe78-spec/bookningsapp/issues/1" },
  { label: "Germany-only listing", url: "https://superteam.fun/earn/listing/travel-boost-for-bp26" },
  { label: "Audit “grant”", url: "https://superteam.fun/earn/listing/vaultline-security-audit-grants-for-colosseum-projects-up-to-4000-usdc-each" },
  { label: "Token promo thread", url: "https://superteam.fun/earn/listing/chimp-on-metaplex" },
  { label: "Nebius x NVIDIA hackathon", url: "https://nebiusglobalaihackathon.devpost.com" },
];

const STEPS = ["Reading the page with Tavily", "Checking platform data", "Extracting facts with Nemotron Lightning", "Running red-flag rules", "Reasoning a verdict with Nemotron Ultra"];

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReportData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const loadHistory = () => fetch("/api/history").then((r) => r.json()).then(setHistory).catch(() => {});
  useEffect(() => {
    loadHistory();
    // Deep link from Scan / Memory: /?url=… opens that analysis (served from memory when fresh).
    const linked = new URLSearchParams(window.location.search).get("url");
    if (linked) analyze(linked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [loading]);

  async function analyze(target = url, force = false) {
    if (!target.trim()) return;
    setUrl(target);
    setStep(0);
    setLoading(true);
    setError(null);
    if (!force) setResult(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target, force }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
      loadHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Is this bounty worth your time?</h1>
        <p className="mt-3 text-zinc-600 dark:text-zinc-400">
          Paste a hackathon, bounty or GitHub issue. Opportunity Shield checks whether <em>you</em> are eligible, what the prize really is, and exposes the traps — every flag backed by a quote.
        </p>
      </div>

      <form
        className="mt-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          analyze();
        }}
      >
        <Input placeholder="https://superteam.fun/earn/listing/…" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" className="py-3 text-base" aria-label="Opportunity URL" />
        <Button disabled={loading || !url.trim()} className="py-3">
          {loading ? "Analyzing…" : "Analyze"}
        </Button>
      </form>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.url}
            onClick={() => analyze(ex.url)}
            disabled={loading}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {ex.label}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        {loading && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900/60">
            <ol className="space-y-2 text-sm">
              {STEPS.map((s, i) => (
                <li key={s} className={cx("flex items-center gap-2", i > step ? "text-zinc-400" : i === step ? "font-medium" : "text-zinc-500")}>
                  <span className={cx("h-2 w-2 rounded-full", i < step ? "bg-emerald-500" : i === step ? "animate-pulse bg-zinc-900 dark:bg-white" : "bg-zinc-300 dark:bg-zinc-700")} />
                  {s}
                </li>
              ))}
            </ol>
          </div>
        )}
        {error && <ErrorBox>{error}</ErrorBox>}
        {result && !loading && <Report r={result} onReanalyze={() => analyze(result.url, true)} busy={loading} />}
      </div>

      {history.length > 0 && !result && !loading && (
        <section className="mt-10">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">Recent analyses</h2>
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/60">
            {history.slice(0, 8).map((h) => (
              <li key={h.url}>
                <button onClick={() => analyze(h.url)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", VERDICT_STYLE[h.verdict].dot)} />
                  <span className="min-w-0 flex-1 truncate">{h.title}</span>
                  <span className="hidden shrink-0 text-xs text-zinc-500 sm:inline">{daysLeft(h.deadline)}</span>
                  <span className="w-16 shrink-0 text-right text-xs font-medium">{VERDICT_STYLE[h.verdict].label}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

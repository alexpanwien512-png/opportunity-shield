"use client";

import { useState } from "react";
import type { AnalysisResult, RedFlag, Verdict } from "@/lib/shield/types";

const EXAMPLES = [
  { label: "Star-farm poem bounty", url: "https://github.com/SecureBananaLabs/bug-bounty/issues/76" },
  { label: "Test bounty, pay by DM", url: "https://github.com/jomaaabbe78-spec/bookningsapp/issues/1" },
  { label: "Germany-only listing", url: "https://superteam.fun/earn/listing/travel-boost-for-bp26" },
  { label: "Token promo thread", url: "https://superteam.fun/earn/listing/chimp-on-metaplex" },
  { label: "Nebius x NVIDIA hackathon", url: "https://nebiusglobalaihackathon.devpost.com" },
];

const VERDICT_STYLE: Record<Verdict, { label: string; ring: string; chip: string; icon: string }> = {
  APPLY: { label: "Apply", ring: "border-emerald-500/40 bg-emerald-500/5", chip: "bg-emerald-500 text-white", icon: "✓" },
  CAUTION: { label: "Caution", ring: "border-amber-500/40 bg-amber-500/5", chip: "bg-amber-500 text-black", icon: "!" },
  AVOID: { label: "Avoid", ring: "border-rose-500/40 bg-rose-500/5", chip: "bg-rose-600 text-white", icon: "✕" },
};

const SEVERITY_STYLE: Record<RedFlag["severity"], string> = {
  critical: "bg-rose-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-amber-400 text-black",
  low: "bg-zinc-300 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100",
};

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`);

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  async function analyze(target = url) {
    if (!target.trim()) return;
    setUrl(target);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-500">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">◆</span>
          Opportunity Shield
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Is this bounty worth your time?</h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Paste a hackathon, bounty or GitHub issue. The agent reads it, checks your eligibility and exposes the traps — with quotes.
        </p>
      </header>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          analyze();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-base outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-300"
          placeholder="https://superteam.fun/earn/listing/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
        />
        <button
          className="rounded-xl bg-zinc-900 px-5 py-3 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
          disabled={loading || !url.trim()}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.url}
            onClick={() => analyze(ex.url)}
            disabled={loading}
            className="rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-400 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400"
          >
            {ex.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="mt-8 animate-pulse rounded-2xl border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800">
          Extracting the page with Tavily, reading facts with Nemotron, running red-flag rules, reasoning a verdict…
        </div>
      )}
      {error && <div className="mt-8 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">{error}</div>}
      {result && <Report r={result} />}
    </main>
  );
}

function Report({ r }: { r: AnalysisResult }) {
  const v = VERDICT_STYLE[r.verdict];
  return (
    <section className="mt-8 space-y-4">
      <div className={`rounded-2xl border p-6 ${v.ring}`}>
        <div className="flex items-start gap-4">
          <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold ${v.chip}`}>{v.icon}</span>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-zinc-500">{r.platform} · {r.sponsor ?? "unknown sponsor"}</div>
            <h2 className="mt-1 text-xl font-semibold">{v.label}: {r.title}</h2>
            <p className="mt-2 text-zinc-700 dark:text-zinc-300">{r.summary}</p>
          </div>
        </div>
        {r.reasons.length > 0 && (
          <ul className="mt-4 list-disc space-y-1 pl-6 text-sm text-zinc-700 dark:text-zinc-300">
            {r.reasons.map((x, i) => <li key={i}>{x}</li>)}
          </ul>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Eligible" value={r.eligibility.eligible == null ? "Unclear" : r.eligibility.eligible ? "Yes" : "No"} hint={`${r.eligibility.region ?? "Region unknown"} · ${r.eligibility.online == null ? "format unknown" : r.eligibility.online ? "online" : "in person"}`} />
        <Stat label="Competition" value={r.ev.competitors != null && r.ev.prizeCount ? `${r.ev.competitors} / ${r.ev.prizeCount}` : "—"} hint={r.ev.competitorsEstimated ? "estimated entries / prizes" : "entries / prizes"} />
        <Stat label="Expected value" value={r.ev.evPerHourUsd != null ? `${usd(r.ev.evPerHourUsd)}/h` : "—"} hint={`EV ${usd(r.ev.evUsd)} over ~${r.ev.estimatedHours}h`} />
      </div>

      <Card title={`Red flags (${r.flags.length})`}>
        {r.flags.length === 0 ? (
          <p className="text-sm text-zinc-500">No red flags found.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {r.flags.map((f) => (
              <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLE[f.severity]}`}>{f.severity}</span>
                  <span className="font-medium">{f.label}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{f.explanation}</p>
                {f.evidence.map((e, i) => (
                  <blockquote key={i} className="mt-2 border-l-2 border-zinc-300 pl-3 text-sm italic text-zinc-700 dark:border-zinc-700 dark:text-zinc-300">
                    “{e.quote}”
                    <span className="ml-2 not-italic text-xs text-zinc-400">{e.source.startsWith("http") ? <a className="underline" href={e.source} target="_blank" rel="noreferrer">source</a> : e.source}</span>
                  </blockquote>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Prizes">
        {r.prizes.length === 0 ? (
          <p className="text-sm text-zinc-500">No per-place prize data.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.prizes.map((p, i) => (
              <span key={i} className="rounded-lg border border-zinc-200 px-2.5 py-1 text-sm dark:border-zinc-800">
                <span className="text-zinc-500">#{p.place}</span> {p.amount != null ? p.amount.toLocaleString("en-US") : "?"} {p.currency ?? ""}
                <span className="ml-1 text-xs text-zinc-400">{p.kind}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs text-zinc-400">
        Sources: {r.sources.join(", ") || "none"} · Models: {r.models.fast} (extraction), {r.models.reasoning} (verdict{r.modelVerdict ? `: ${r.modelVerdict}` : ": unavailable, rules only"}) · Rule ceiling: {r.gateVerdict}
      </p>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{hint}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-zinc-200 p-5 dark:border-zinc-800">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

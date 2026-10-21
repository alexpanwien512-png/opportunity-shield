"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Card, Empty, ErrorBox, PLATFORM_LABEL, VerdictPill, cx, daysLeft, usd } from "@/components/ui";
import type { Bucket, Candidate, ScanEvent, ScanItem } from "@/lib/shield/scan";

const BUCKETS: { id: Bucket; title: string; hint: string; accent: string }[] = [
  { id: "NOW", title: "Now", hint: "Apply, closes within 3 weeks", accent: "bg-emerald-500" },
  { id: "NEXT", title: "Next", hint: "Worth it, not urgent", accent: "bg-sky-500" },
  { id: "PARK", title: "Park", hint: "Avoid, closed or not worth the hours", accent: "bg-zinc-400" },
];

export default function ScanPage() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dropped, setDropped] = useState<{ url: string; reason: string }[]>([]);
  const [analyzing, setAnalyzing] = useState<string[]>([]);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(6);

  const say = (line: string) => setLog((l) => [...l, line]);

  function handle(e: ScanEvent) {
    if (e.type === "searching") say(`Searching with Tavily: ${e.queries.map((q) => `“${q}”`).join(", ")} + Devpost & Superteam open feeds`);
    if (e.type === "discovered") {
      setCandidates(e.candidates);
      say(`Found ${e.candidates.length} open listings`);
    }
    if (e.type === "triaged") {
      setDropped(e.dropped);
      say(`Filtered: ${e.dropped.length} dropped (expired, region-locked, off-skill or over limit) · ${e.kept.length} go to deep analysis`);
    }
    if (e.type === "analyzing") setAnalyzing((a) => [...a, e.url]);
    if (e.type === "result") {
      setAnalyzing((a) => a.filter((u) => u !== e.item.url));
      setItems((xs) => [...xs.filter((x) => x.url !== e.item.url), e.item]);
    }
    if (e.type === "failed") {
      setAnalyzing((a) => a.filter((u) => u !== e.url));
      say(`Could not analyze ${e.url || "scan"}: ${e.error}`);
    }
    if (e.type === "done") {
      setItems(e.items);
      say(`Done · ${e.items.filter((i) => i.bucket === "NOW").length} now, ${e.items.filter((i) => i.bucket === "NEXT").length} next, ${e.items.filter((i) => i.bucket === "PARK").length} parked`);
    }
  }

  async function run() {
    setRunning(true);
    setError(null);
    setLog([]);
    setItems([]);
    setDropped([]);
    setCandidates([]);
    setAnalyzing([]);
    try {
      const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) if (line.trim()) handle(JSON.parse(line));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const titleOf = (url: string) => candidates.find((c) => c.url === url)?.title ?? url;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <h1 className="text-3xl font-semibold tracking-tight">Scan for opportunities</h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Finds open hackathons and bounties on Devpost and Superteam Earn, drops what you can’t enter, and runs the full shield on the best fits for your profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500">
            Deep-analyze
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={running} className="ml-1.5 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              {[3, 6, 9, 12].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button onClick={run} disabled={running}>
            {running ? "Scanning…" : "Run scan"}
          </Button>
        </div>
      </div>

      {error && <div className="mt-6"><ErrorBox>{error}</ErrorBox></div>}

      {log.length > 0 && (
        <ol className="mt-6 space-y-1 rounded-2xl border border-zinc-200 bg-white p-4 font-mono text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
          {log.map((l, i) => (
            <li key={i}>› {l}</li>
          ))}
          {analyzing.map((u) => (
            <li key={u} className="animate-pulse">› Analyzing {titleOf(u)}…</li>
          ))}
        </ol>
      )}

      {!running && !log.length && (
        <div className="mt-8">
          <Empty>Scans use your saved profile (country, skills, hourly rate). Each deep analysis costs a few Tavily credits and two Nemotron calls.</Empty>
        </div>
      )}

      {(items.length > 0 || running) && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {BUCKETS.map((b) => {
            const col = items.filter((i) => i.bucket === b.id);
            return (
              <div key={b.id}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cx("h-2 w-2 rounded-full", b.accent)} />
                  <h2 className="text-sm font-semibold">{b.title}</h2>
                  <span className="text-xs text-zinc-500">{col.length}</span>
                </div>
                <p className="mb-3 px-1 text-xs text-zinc-500">{b.hint}</p>
                <div className="space-y-2">
                  {col.map((i) => (
                    <Link
                      key={i.url}
                      href={`/?url=${encodeURIComponent(i.url)}`}
                      className="block rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:hover:border-zinc-600"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-500">
                        <span>{PLATFORM_LABEL[i.platform] ?? i.platform}</span>
                        <VerdictPill verdict={i.verdict} />
                      </div>
                      <div className="mt-1.5 text-sm font-medium leading-snug">{i.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">{i.why}</div>
                      <div className="mt-2 flex flex-wrap gap-x-3 text-xs text-zinc-500">
                        <span>{daysLeft(i.deadline)}</span>
                        {i.bestPrizeUsd != null && <span>top {usd(i.bestPrizeUsd)}</span>}
                        {i.evPerHourUsd != null && <span>EV {usd(i.evPerHourUsd, i.evPerHourUsd < 10 ? 2 : 0)}/h</span>}
                      </div>
                      {i.topFlag && i.bucket !== "NOW" && <div className="mt-2 text-xs text-rose-600 dark:text-rose-400">⚑ {i.topFlag}</div>}
                    </Link>
                  ))}
                  {col.length === 0 && <div className="rounded-xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-400 dark:border-zinc-800">—</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {dropped.length > 0 && (
        <Card title={`Filtered out before deep analysis · ${dropped.length}`} className="mt-6">
          <ul className="space-y-1.5 text-sm">
            {dropped.map((d) => (
              <li key={d.url} className="flex gap-2">
                <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-zinc-700 hover:underline dark:text-zinc-300">
                  {titleOf(d.url)}
                </a>
                <span className="shrink-0 text-right text-xs text-zinc-500 sm:max-w-[50%]">{d.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

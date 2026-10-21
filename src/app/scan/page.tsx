"use client";

import Link from "next/link";
import { useState } from "react";
import { announce } from "@/components/Emblem";
import { IconChevron, IconClock, IconCoins, IconRadar, IconTrophy } from "@/components/icons";
import { Button, Empty, ErrorBox, PLATFORM_LABEL, Segmented, VerdictPill, cx, daysLeft, usd } from "@/components/ui";
import type { Bucket, Candidate, ScanEvent, ScanItem } from "@/lib/shield/scan";
import { groupBy } from "@/lib/ui/present";

const BUCKETS: { id: Bucket; title: string; hint: string; dot: string }[] = [
  { id: "NOW", title: "Now", hint: "Apply — closes within 3 weeks", dot: "bg-apply" },
  { id: "NEXT", title: "Next", hint: "Worth it, not urgent", dot: "bg-brand" },
  { id: "PARK", title: "Park", hint: "Avoid, closed, or not worth the hours", dot: "bg-faint" },
];

/** Short, groupable reason for a filtered-out listing. */
function dropGroup(reason: string): string {
  if (/^Restricted to/i.test(reason)) return "Region-locked";
  if (/deadline|closed|status/i.test(reason)) return "Closed or expired";
  if (/scan limit/i.test(reason)) return "Over this scan's limit";
  return "Not a fit for your skills";
}

function ScanCard({ i }: { i: ScanItem }) {
  return (
    <Link href={`/?url=${encodeURIComponent(i.url)}`} className="surface block rounded-2xl p-4 transition hover:-translate-y-0.5 hover:border-line-strong">
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span>{PLATFORM_LABEL[i.platform] ?? i.platform}</span>
        <VerdictPill verdict={i.verdict} />
      </div>
      <div className="mt-2 font-medium leading-snug">{i.title}</div>
      <div className="mt-1 text-xs text-muted">{i.why}</div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <IconClock size={12} /> {daysLeft(i.deadline)}
        </span>
        {i.bestPrizeUsd != null && (
          <span className="inline-flex items-center gap-1">
            <IconTrophy size={12} /> <span className="num">{usd(i.bestPrizeUsd)}</span>
          </span>
        )}
        {i.evPerHourUsd != null && (
          <span className="inline-flex items-center gap-1">
            <IconCoins size={12} /> <span className="num">{usd(i.evPerHourUsd, i.evPerHourUsd < 10 ? 2 : 0)}/h</span>
          </span>
        )}
      </div>
      {i.topFlag && i.bucket !== "NOW" && <div className="mt-2 text-xs text-avoid">⚑ {i.topFlag}</div>}
    </Link>
  );
}

function Column({ b, items, running }: { b: (typeof BUCKETS)[number]; items: ScanItem[]; running: boolean }) {
  const list =
    items.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-line p-5 text-center text-xs text-muted">{running ? "Waiting for results…" : "Nothing here"}</div>
    ) : b.id === "PARK" ? (
      <div className="space-y-2">
        {groupBy(items, (i) => i.topFlag ?? i.why).map(([reason, group]) => (
          <details key={reason} className="surface rounded-2xl">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="min-w-0 truncate">{reason}</span>
              <span className="flex items-center gap-1 text-xs text-muted">
                <span className="num">{group.length}</span> <IconChevron size={14} />
              </span>
            </summary>
            <div className="space-y-2 px-2 pb-2">
              {group.map((i) => (
                <ScanCard key={i.url} i={i} />
              ))}
            </div>
          </details>
        ))}
      </div>
    ) : (
      <div className="space-y-2">
        {items.map((i) => (
          <ScanCard key={i.url} i={i} />
        ))}
      </div>
    );
  return (
    <section aria-label={`${b.title}: ${b.hint}`}>
      <div className="mb-1 flex items-center gap-2 px-1">
        <span className={cx("h-2 w-2 rounded-full", b.dot)} aria-hidden />
        <h2 className="text-sm font-semibold">{b.title}</h2>
        <span className="num text-xs text-muted">{items.length}</span>
      </div>
      <p className="mb-3 px-1 text-xs text-muted">{b.hint}</p>
      {list}
    </section>
  );
}

export default function ScanPage() {
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<{ text: string; tone?: "ok" | "warn" }[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dropped, setDropped] = useState<{ url: string; reason: string }[]>([]);
  const [analyzing, setAnalyzing] = useState<string[]>([]);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(6);
  const [tab, setTab] = useState<Bucket>("NOW");
  const started = log.length > 0 || running;

  const say = (text: string, tone?: "ok" | "warn") => setLog((l) => [...l, { text, tone }]);
  const titleOf = (url: string) => candidates.find((c) => c.url === url)?.title ?? url.replace(/^https:\/\//, "");

  function handle(e: ScanEvent) {
    if (e.type === "searching") say(`Searching with Tavily + Devpost & Superteam open listings`);
    if (e.type === "discovered") {
      setCandidates(e.candidates);
      say(`Found ${e.candidates.length} open listings`, "ok");
    }
    if (e.type === "triaged") {
      setDropped(e.dropped);
      say(`Filtered out ${e.dropped.length} · Nemotron Lightning picked ${e.kept.length} for a deep look`, "ok");
    }
    if (e.type === "analyzing") setAnalyzing((a) => [...a, e.url]);
    if (e.type === "result") {
      setAnalyzing((a) => a.filter((u) => u !== e.item.url));
      setItems((xs) => [...xs.filter((x) => x.url !== e.item.url), e.item]);
    }
    if (e.type === "failed") {
      setAnalyzing((a) => a.filter((u) => u !== e.url));
      say(`Couldn't analyze ${e.url ? titleOf(e.url) : "one listing"} — skipped`, "warn");
    }
    if (e.type === "done") {
      setItems(e.items);
      const n = (b: Bucket) => e.items.filter((i) => i.bucket === b).length;
      say(`Done · ${n("NOW")} now, ${n("NEXT")} next, ${n("PARK")} parked`, "ok");
      setTab(n("NOW") ? "NOW" : n("NEXT") ? "NEXT" : "PARK");
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
    announce({ mode: "busy" });
    try {
      const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => null))?.error ?? "The scan couldn't start. Try again in a minute.");
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
      setError(err instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : (err as Error).message);
    } finally {
      setRunning(false);
      announce({ mode: "idle" });
    }
  }

  const byBucket = (b: Bucket) => items.filter((i) => i.bucket === b);

  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">Scan</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Find what&apos;s worth doing</h1>
          <p className="mt-2 text-muted">
            Finds open hackathons and bounties on Devpost and Superteam Earn, drops what you can&apos;t enter, and runs the full shield on the best fits for your profile.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            Deep-analyze
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={running}
              className="num h-10 rounded-xl border border-line-strong bg-surface px-2 text-sm text-text"
            >
              {[3, 6, 9, 12].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <Button onClick={run} disabled={running} size="md">
            <IconRadar size={16} className={running ? "spin" : undefined} /> {running ? "Scanning…" : "Run scan"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-6">
          <ErrorBox onRetry={run}>{error}</ErrorBox>
        </div>
      )}

      {!started && !error && (
        <div className="mt-8">
          <Empty
            icon={<IconRadar size={22} />}
            title="Your radar is quiet"
            action={
              <Button onClick={run}>
                <IconRadar size={16} /> Run your first scan
              </Button>
            }
          >
            A scan takes 1–3 minutes. It uses your profile (country, skills, hourly rate), so set that first if you haven&apos;t.
          </Empty>
        </div>
      )}

      {log.length > 0 && (
        <ol className="surface mt-6 space-y-1.5 rounded-2xl p-4 text-sm" aria-live="polite" aria-label="Scan progress">
          {log.map((l, i) => (
            <li key={i} className="rise flex items-start gap-2">
              <span aria-hidden className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", l.tone === "warn" ? "bg-caution" : l.tone === "ok" ? "bg-apply" : "bg-brand")} />
              <span className="text-text/90">{l.text}</span>
            </li>
          ))}
          {analyzing.map((u) => (
            <li key={u} className="flex items-start gap-2 text-muted">
              <span aria-hidden className="spin mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-brand border-t-transparent" />
              <span className="truncate">Analyzing {titleOf(u)}…</span>
            </li>
          ))}
        </ol>
      )}

      {started && (items.length > 0 || running) && (
        <>
          <div className="mt-6 md:hidden">
            <Segmented
              label="Results"
              value={tab}
              onChange={setTab}
              options={BUCKETS.map((b) => ({ id: b.id, label: <span>{b.title} <span className="num text-xs opacity-70">{byBucket(b.id).length}</span></span> }))}
            />
            <div className="mt-4">
              <Column b={BUCKETS.find((b) => b.id === tab)!} items={byBucket(tab)} running={running} />
            </div>
          </div>
          <div className="mt-6 hidden gap-4 md:grid md:grid-cols-3">
            {BUCKETS.map((b) => (
              <Column key={b.id} b={b} items={byBucket(b.id)} running={running} />
            ))}
          </div>
        </>
      )}

      {dropped.length > 0 && (
        <details className="surface mt-6 rounded-2xl">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm">
            <span className="font-medium">
              Filtered out before deep analysis · <span className="num">{dropped.length}</span>
            </span>
            <IconChevron size={16} className="text-muted" />
          </summary>
          <div className="space-y-4 px-5 pb-5">
            {groupBy(dropped, (d) => dropGroup(d.reason)).map(([group, list]) => (
              <div key={group}>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
                  {group} · <span className="num">{list.length}</span>
                </h3>
                <ul className="space-y-1 text-sm">
                  {list.map((d) => (
                    <li key={d.url} className="flex gap-3">
                      <a href={d.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded hover:underline">
                        {titleOf(d.url)}
                      </a>
                      <span className="hidden max-w-[45%] shrink-0 truncate text-right text-xs text-muted sm:block">{d.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

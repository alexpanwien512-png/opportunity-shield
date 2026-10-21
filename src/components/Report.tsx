"use client";

import { useState } from "react";
import type { AnalysisResult } from "@/lib/shield/types";
import { Button, Card, PLATFORM_LABEL, SEVERITY_STYLE, Stat, VERDICT_STYLE, cx, daysLeft, usd } from "./ui";

export type ReportData = AnalysisResult & { cached?: boolean };

export function Report({ r, onReanalyze, busy }: { r: ReportData; onReanalyze?: () => void; busy?: boolean }) {
  const v = VERDICT_STYLE[r.verdict];
  const [blacklisted, setBlacklisted] = useState<string | null>(null);
  const repoOrSponsor = r.platform === "github" ? r.url.split("/").slice(3, 5).join("/") : r.sponsor;

  async function blacklist() {
    if (!repoOrSponsor) return;
    const kind = r.platform === "github" ? "repo" : "sponsor";
    await fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: repoOrSponsor, kind, reason: r.flags[0]?.label ?? r.verdict }),
    });
    setBlacklisted(repoOrSponsor);
  }

  const cashPrizes = r.prizes.filter((p) => p.kind === "cash" || p.kind === "crypto");

  return (
    <div className="space-y-4">
      <section className={cx("rounded-2xl border p-5 sm:p-6", v.tone)}>
        <div className="flex items-start gap-4">
          <span className={cx("inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl font-bold shadow-sm", v.solid)}>{v.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
              <span className="font-medium">{PLATFORM_LABEL[r.platform] ?? r.platform}</span>
              {r.sponsor && <span>· {r.sponsor}</span>}
              <span>· {daysLeft(r.deadline)}</span>
              {r.cached && <span className="rounded bg-zinc-900/5 px-1.5 py-0.5 dark:bg-white/10">from memory</span>}
            </div>
            <h2 className="mt-1 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              <span className="mr-2">{v.label}</span>
              <a href={r.url} target="_blank" rel="noreferrer" className="font-normal text-zinc-600 underline-offset-4 hover:underline dark:text-zinc-300">
                {r.title}
              </a>
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">{r.summary}</p>
          </div>
        </div>
        {r.reasons.length > 0 && (
          <ul className="mt-4 space-y-1.5 pl-3 text-sm sm:pl-16 text-zinc-700 dark:text-zinc-300">
            {r.reasons.map((x, i) => (
              <li key={i} className="relative before:absolute before:-left-3 before:top-2 before:h-1 before:w-1 before:rounded-full before:bg-zinc-400">{x}</li>
            ))}
          </ul>
        )}
        {r.escalation && (
          <p className="mt-4 rounded-lg sm:ml-16 bg-white/60 p-3 text-xs text-zinc-600 dark:bg-black/20 dark:text-zinc-400">
            {r.escalation.accepted ? (
              <>Nemotron Ultra escalated the rule verdict ({VERDICT_STYLE[r.gateVerdict].label}) to {VERDICT_STYLE[r.escalation.to].label} — <b>{r.escalation.criterion?.replaceAll("_", " ")}</b>: “{r.escalation.quote}”</>
            ) : (
              <>Nemotron suggested {VERDICT_STYLE[r.escalation.to].label} but could not back it with a rubric criterion and a quote from the page, so the rule verdict stands.</>
            )}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2 sm:pl-16">
          {onReanalyze && (
            <Button variant="secondary" onClick={onReanalyze} disabled={busy}>
              ↻ Re-analyze fresh
            </Button>
          )}
          {r.verdict !== "APPLY" && repoOrSponsor && (
            <Button variant="ghost" onClick={blacklist} disabled={!!blacklisted}>
              {blacklisted ? `“${blacklisted}” blacklisted` : `Blacklist ${r.platform === "github" ? "repo" : "sponsor"}`}
            </Button>
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Eligible"
          value={r.eligibility.eligible == null ? "Unclear" : r.eligibility.eligible ? "Yes" : "No"}
          hint={`${r.eligibility.region ?? "Region unknown"} · ${r.eligibility.online == null ? "format unknown" : r.eligibility.online ? "online" : "in person"}`}
        />
        <Stat
          label="Competition"
          value={r.ev.competitors != null && r.ev.prizeCount ? `${r.ev.competitors.toLocaleString("en-US")} : ${r.ev.prizeCount}` : "—"}
          hint={r.ev.competitorsEstimated ? "estimated entries : prizes" : "entries : prizes"}
        />
        <Stat
          label="Expected value"
          value={r.eligibility.eligible === false ? "n/a" : r.ev.evPerHourUsd != null ? `${usd(r.ev.evPerHourUsd, r.ev.evPerHourUsd < 10 ? 2 : 0)}/h` : "—"}
          hint={r.ev.winProbability != null ? `P(win) ${(r.ev.winProbability * 100).toFixed(1)}% · ~${r.ev.estimatedHours}h of work` : `~${r.ev.estimatedHours}h of work`}
        />
      </div>

      <Card title={`Red flags · ${r.flags.length}`}>
        {r.flags.length === 0 ? (
          <p className="text-sm text-zinc-500">No red flags found.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {r.flags.map((f) => (
              <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", SEVERITY_STYLE[f.severity])}>{f.severity}</span>
                  <span className="font-medium">{f.label}</span>
                  {f.id.startsWith("model-") && <span className="text-xs text-zinc-400">found by Nemotron</span>}
                </div>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{f.explanation}</p>
                {f.evidence.map((e, i) => (
                  <blockquote key={i} className="mt-2 rounded-r-lg border-l-2 border-zinc-300 bg-zinc-50 py-1.5 pl-3 pr-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
                    <span className="italic">“{e.quote}”</span>
                    <span className="ml-2 whitespace-nowrap text-[11px] text-zinc-400">
                      {e.source.startsWith("http") ? (
                        <a className="underline" href={e.source} target="_blank" rel="noreferrer">
                          source ↗
                        </a>
                      ) : (
                        e.source
                      )}
                    </span>
                  </blockquote>
                ))}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={`Prizes${cashPrizes.length ? ` · best ${usd(r.ev.bestPrizeUsd)}` : ""}`}>
        {r.prizes.length === 0 ? (
          <p className="text-sm text-zinc-500">No per-place prize data.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {r.prizes.map((p, i) => (
              <span key={i} className="inline-flex items-baseline gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1 text-sm dark:border-zinc-800">
                <span className="text-zinc-500">{/^\d+$/.test(p.place) ? `#${p.place}` : p.place}</span>
                <span className="font-medium">{p.amount != null ? `${p.amount.toLocaleString("en-US")} ${p.currency ?? ""}` : "—"}</span>
                <span className={cx("text-[11px]", p.kind === "cash" || p.kind === "crypto" ? "text-emerald-600" : "text-amber-600")}>{p.kind}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs leading-relaxed text-zinc-400">
        Read with {r.sources.join(" + ") || "no sources"} · extraction by {r.models.fast.replace("nvidia/", "")}, verdict by {r.models.reasoning.replace("nvidia/", "")}
        {r.modelVerdict ? "" : " (unavailable — rules-only verdict)"} · rule ceiling {VERDICT_STYLE[r.gateVerdict].label}
        {Object.keys(r.timingsMs).length > 0 && ` · ${(Object.values(r.timingsMs).reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s`}
      </p>
    </div>
  );
}

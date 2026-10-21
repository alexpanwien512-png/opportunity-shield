"use client";

import { useState } from "react";
import type { AnalysisResult, RedFlag } from "@/lib/shield/types";
import { plainWords, trustScore } from "@/lib/ui/present";
import {
  IconAlert, IconBan, IconBrain, IconClock, IconCoins, IconExternal, IconFlag, IconGavel, IconGlobe, IconMessage, IconPin, IconRefresh, IconStar,
  IconTag, IconTrophy, IconUsers, IconZap,
} from "./icons";
import { Button, Card, CountUp, Gauge, PLATFORM_LABEL, SEVERITY, VERDICT, VerdictPill, cx, daysLeft, daysLeftNumber, usd } from "./ui";

export type ReportData = AnalysisResult & { cached?: boolean };

const SOURCE_NAME: Record<string, string> = {
  "tavily:extract": "Tavily Extract",
  "tavily:search": "Tavily Search",
  "github:api": "GitHub API",
  "github:api-unavailable": "GitHub API (rate-limited)",
  "superteam:api": "Superteam API",
  "devpost:api": "Devpost API",
};
export const prettyModel = (id: string) => id.replace(/^nvidia\//, "").replace(/_/g, ".").replace(/-/g, " ").replace(/(\d+(?:\.\d+)?b) a(\d+b)/i, "$1").replace(/(\d)b\b/g, "$1B");

/** Model flags that repeat a rule flag's finding add noise, not evidence. */
function visibleFlags(flags: RedFlag[]): RedFlag[] {
  const norm = (s: string) => s.toLowerCase().replace(/\b(a|an|the)\b/g, "").replace(/[^a-z]/g, "");
  const ruleLabels = new Set(flags.filter((f) => !f.id.startsWith("model-")).map((f) => norm(f.label)));
  return flags.filter((f) => !f.id.startsWith("model-") || !ruleLabels.has(norm(f.label)));
}

const FLAG_ICON: Record<string, typeof IconFlag> = {
  "engagement-farming": IconStar,
  "test-bounty": IconZap,
  "offplatform-payment": IconMessage,
  "absurd-reward": IconCoins,
  "non-technical-in-code-repo": IconTag,
  "attempt-flood": IconUsers,
  "pr-flood": IconUsers,
  "bounty-command-only": IconTag,
  "region-mismatch": IconPin,
  "non-cash-prize": IconCoins,
  "unverified-sponsor": IconAlert,
  "sponsor-reputation": IconAlert,
  "token-promotion": IconCoins,
  "precondition-existing-project": IconGavel,
  "engagement-judging": IconStar,
  "competition-ratio": IconUsers,
  "listing-changed": IconAlert,
  blacklist: IconBan,
};

function sourceLabel(source: string, platform: string): string {
  if (source === "page") return "on the page";
  if (source.startsWith("memory")) return "your blacklist";
  if (source.includes(" vs ")) return "live listing vs. indexed copy";
  if (source.endsWith(":api")) return `${PLATFORM_LABEL[source.split(":")[0]] ?? platform} API`;
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
}

function EvidenceCard({ f, i, url, platform }: { f: RedFlag; i: number; url: string; platform: string }) {
  const Icon = f.id.startsWith("model-") ? IconBrain : (FLAG_ICON[f.id] ?? IconFlag);
  const sev = SEVERITY[f.severity];
  const tone = f.severity === "critical" || f.severity === "high" ? "text-avoid bg-avoid-soft" : f.severity === "medium" ? "text-caution bg-caution-soft" : "text-muted bg-surface-2";
  return (
    <li className="surface rise flex flex-col rounded-2xl p-4" style={{ animationDelay: `${250 + i * 80}ms` }}>
      <div className="flex items-start gap-3">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tone)}>
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider", sev.cls)}>{sev.label}</span>
            {f.id.startsWith("model-") && <span className="text-[11px] text-muted">found by Nemotron</span>}
          </div>
          <h4 className="mt-1 font-medium leading-snug">{f.label}</h4>
        </div>
      </div>
      <p className="mt-2 text-sm text-muted">{f.explanation}</p>
      <div className="mt-3 space-y-2">
        {f.evidence.map((e, j) => {
          const href = e.source.startsWith("http") ? e.source : e.source === "page" ? url : null;
          return (
            <figure key={j} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm">
              <blockquote className="leading-relaxed break-words">
                <span className="marker" style={{ animationDelay: `${450 + i * 80}ms` }}>
                  “{e.quote.length > 280 ? `${e.quote.slice(0, 277)}…` : e.quote}”
                </span>
              </blockquote>
              <figcaption className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded hover:text-text">
                    Source: {sourceLabel(e.source, platform)} <IconExternal size={11} />
                  </a>
                ) : (
                  <>Source: {sourceLabel(e.source, platform)}</>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </li>
  );
}

function Stat({ icon, label, children, hint, delay }: { icon: React.ReactNode; label: string; children: React.ReactNode; hint?: React.ReactNode; delay: number }) {
  return (
    <div className="surface rise rounded-2xl p-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{children}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Report({ r, onReanalyze, busy }: { r: ReportData; onReanalyze?: () => void; busy?: boolean }) {
  const v = VERDICT[r.verdict];
  const [blacklisted, setBlacklisted] = useState<string | null>(null);
  const repoOrSponsor = r.platform === "github" ? r.url.split("/").slice(3, 5).join("/") : r.sponsor;
  const score = trustScore(r);
  const days = daysLeftNumber(r.deadline);
  const ineligible = r.eligibility.eligible === false;
  const flags = visibleFlags(r.flags);
  // If the model leaned more lenient than the final (rule-capped) verdict, its prose would contradict the badge.
  const RANK = { APPLY: 0, CAUTION: 1, AVOID: 2 } as const;
  const modelSofter = !!r.modelVerdict && RANK[r.modelVerdict] < RANK[r.verdict];
  const summary = modelSofter
    ? `The rule checks found ${flags.filter((f) => f.severity !== "low").length} issue(s) that cap this at ${VERDICT[r.verdict].label}, even though the model leaned toward ${VERDICT[r.modelVerdict!].label}.`
    : r.summary;
  const reasons = modelSofter ? flags.filter((f) => f.severity !== "low").map((f) => f.explanation) : r.reasons;
  const cashPrizes = r.prizes.filter((p) => (p.kind === "cash" || p.kind === "crypto") && p.amount != null);

  async function blacklist() {
    if (!repoOrSponsor) return;
    await fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: repoOrSponsor, kind: r.platform === "github" ? "repo" : "sponsor", reason: r.flags[0]?.label ?? r.verdict }),
    });
    setBlacklisted(repoOrSponsor);
  }

  return (
    <div className="space-y-4">
      {/* Verdict reveal */}
      <section className={cx("rise relative overflow-hidden rounded-3xl border p-5 sm:p-7", v.border, v.bg)} aria-labelledby="verdict-title">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Gauge value={score} verdict={r.verdict} size={108} />
          <div className="min-w-0 flex-1">
            <div className="pop">
              <VerdictPill verdict={r.verdict} size="lg" />
            </div>
            <h2 id="verdict-title" className="mt-3 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              {plainWords(r)}
            </h2>
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1 rounded font-medium text-text hover:underline">
                <span className="truncate">{r.title}</span> <IconExternal size={13} className="shrink-0" />
              </a>
              <span aria-hidden>·</span>
              <span>{PLATFORM_LABEL[r.platform] ?? r.platform}</span>
              {r.sponsor && (
                <>
                  <span aria-hidden>·</span>
                  <span>{r.sponsor}</span>
                </>
              )}
              {r.cached && <span className="rounded-md bg-surface/70 px-1.5 py-0.5 text-[11px] ring-1 ring-inset ring-line">from memory</span>}
            </p>
          </div>
        </div>
        <p className="mt-5 border-t border-line pt-4 text-[15px] leading-relaxed text-text/90">{summary}</p>
        {r.escalation && (
          <p className="mt-3 rounded-xl bg-surface/70 p-3 text-xs text-muted ring-1 ring-inset ring-line">
            {r.escalation.accepted ? (
              <>
                <b className="text-text">Nemotron Ultra went stricter</b> than the rules ({VERDICT[r.gateVerdict].label} → {VERDICT[r.escalation.to].label}) and proved it:{" "}
                <span className="marker">“{r.escalation.quote}”</span>
              </>
            ) : (
              <>Nemotron suggested {VERDICT[r.escalation.to].label} but couldn&apos;t back it with evidence of the right kind, so the rules&apos; verdict stands.</>
            )}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {onReanalyze && (
            <Button variant="secondary" size="sm" onClick={onReanalyze} disabled={busy}>
              <IconRefresh size={14} /> Re-analyze fresh
            </Button>
          )}
          {r.verdict !== "APPLY" && repoOrSponsor && (
            <Button variant="ghost" size="sm" onClick={blacklist} disabled={!!blacklisted}>
              <IconBan size={14} /> {blacklisted ? `“${blacklisted}” blacklisted` : `Never show this ${r.platform === "github" ? "repo" : "sponsor"} again`}
            </Button>
          )}
        </div>
      </section>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat delay={120} icon={<IconTrophy size={13} />} label="Top cash prize" hint={cashPrizes.length ? `${r.ev.prizeCount ?? cashPrizes.length} prize${(r.ev.prizeCount ?? 0) === 1 ? "" : "s"} in total` : "no cash per place found"}>
          {r.ev.bestPrizeUsd != null ? <CountUp value={r.ev.bestPrizeUsd} format={(n) => usd(n)} /> : <span className="num text-muted">—</span>}
        </Stat>
        <Stat delay={170} icon={<IconUsers size={13} />} label="Entries / prizes" hint={r.ev.competitorsEstimated ? "entries estimated from sign-ups" : "from the platform"}>
          {r.ev.competitors != null && r.ev.prizeCount ? (
            <span className="num">
              <CountUp value={r.ev.competitors} /> / {r.ev.prizeCount}
            </span>
          ) : (
            <span className="num text-muted">—</span>
          )}
        </Stat>
        <Stat delay={220} icon={<IconClock size={13} />} label="Time left" hint={r.deadline ? new Date(r.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "deadline not found"}>
          {days != null && days >= 0 ? (
            <span className="num">
              <CountUp value={days} /> <span className="text-base font-normal text-muted">day{days === 1 ? "" : "s"}</span>
            </span>
          ) : (
            <span className="text-muted">{daysLeft(r.deadline)}</span>
          )}
        </Stat>
        <Stat
          delay={270}
          icon={<IconCoins size={13} />}
          label="Expected value"
          hint={ineligible ? "you can't enter" : r.ev.winProbability != null ? `P(win) ${(r.ev.winProbability * 100).toFixed(1)}% · ~${r.ev.estimatedHours}h work` : `~${r.ev.estimatedHours}h of work`}
        >
          {ineligible ? (
            <span className="text-muted">n/a</span>
          ) : r.ev.evPerHourUsd != null ? (
            <span className="num">
              <CountUp value={r.ev.evPerHourUsd} format={(n) => usd(n, r.ev.evPerHourUsd! < 10 ? 2 : 0)} />
              <span className="text-base font-normal text-muted">/h</span>
            </span>
          ) : (
            <span className="num text-muted">—</span>
          )}
        </Stat>
      </div>

      {/* Evidence */}
      <section aria-labelledby="flags-title">
        <h3 id="flags-title" className="mb-3 mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <IconFlag size={14} /> Red flags · <span className="num">{flags.length}</span>
        </h3>
        {flags.length === 0 ? (
          <div className="surface rise flex items-center gap-3 rounded-2xl p-4 text-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-apply-soft text-apply">
              <IconGlobe size={17} />
            </span>
            No red flags found. Every rule passed.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {flags.map((f, i) => (
              <EvidenceCard key={f.id} f={f} i={i} url={r.url} platform={r.platform} />
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Why" icon={<IconBrain size={14} />} className="rise">
          <ul className="space-y-2 text-sm">
            {reasons.map((x, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className={cx("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", v.solid.split(" ")[0])} />
                <span className="text-text/90">{x}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Prizes & eligibility" icon={<IconTrophy size={14} />} className="rise">
          <dl className="mb-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-muted">Eligible</dt>
              <dd className={cx("font-medium", ineligible ? "text-avoid" : r.eligibility.eligible ? "text-apply" : "")}>{r.eligibility.eligible == null ? "Unclear" : r.eligibility.eligible ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Where</dt>
              <dd className="font-medium">
                {r.eligibility.region ?? "Unknown"} · {r.eligibility.online == null ? "format unknown" : r.eligibility.online ? "online" : "in person"}
              </dd>
            </div>
          </dl>
          {r.prizes.length === 0 ? (
            <p className="text-sm text-muted">No per-place prize data.</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {r.prizes.map((p, i) => {
                const money = p.kind === "cash" || p.kind === "crypto";
                return (
                  <li key={i} className="inline-flex items-baseline gap-1.5 rounded-lg border border-line px-2 py-1 text-xs">
                    <span className="text-muted">{/^\d+$/.test(p.place) ? `#${p.place}` : p.place}</span>
                    {p.amount != null && <span className="num font-medium">{`${p.amount.toLocaleString("en-US")} ${p.currency ?? ""}`}</span>}
                    <span className={money ? "text-apply" : "text-caution"}>{money ? "cash" : "non-cash"}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-xs leading-relaxed text-muted">
        Read with {r.sources.map((x) => SOURCE_NAME[x] ?? x).join(" + ") || "no sources"} · facts by {prettyModel(r.models.fast)} · verdict by {prettyModel(r.models.reasoning)}
        {r.modelVerdict ? "" : " (unavailable — rules-only verdict)"} · rule ceiling {VERDICT[r.gateVerdict].label}
        {Object.keys(r.timingsMs).length > 0 && (
          <>
            {" "}
            · <span className="num">{(Object.values(r.timingsMs).reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s</span>
          </>
        )}
      </p>
    </div>
  );
}

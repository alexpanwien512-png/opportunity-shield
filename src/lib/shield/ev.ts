// Expected value per hour: a deliberately simple equal-odds model, shown with its inputs.
import type { ExpectedValue, Extraction, RedFlag, SourceBundle } from "./types";

const DEFAULT_HOURS: Record<string, number> = { github: 4, superteam: 6, devpost: 30, web: 10 };
const SUBMIT_RATE = 0.08; // share of hackathon registrants who actually submit

export function expectedValue(bundle: SourceBundle, extraction: Extraction | null, flags: RedFlag[]): ExpectedValue {
  const f = bundle.facts;
  const hours = extraction?.estimatedHours && extraction.estimatedHours > 0 ? extraction.estimatedHours : DEFAULT_HOURS[bundle.platform];
  const nonCash = flags.some((fl) => fl.id === "non-cash-prize");

  // Only money counts: credits, services and hardware are excluded from the EV.
  const amounts: number[] = [];
  for (const p of f.prizes ?? []) {
    if (p.amount == null || !(p.kind === "cash" || p.kind === "crypto")) continue;
    const times = Number(p.place.match(/x(\d+)\)?$/)?.[1] ?? 1);
    for (let i = 0; i < times; i++) amounts.push(p.amount);
  }
  if (!amounts.length && extraction) {
    for (const p of extraction.prizes) if (p.amount && (p.kind === "cash" || p.kind === "crypto")) amounts.push(p.amount);
  }

  const prizeCount = f.prizeCount ?? (amounts.length || null);
  const bestPrizeUsd = amounts.length ? Math.max(...amounts) : null;
  // Advertised totals can include non-cash perks, so per-place cash wins over the headline number.
  const cashTotal = amounts.reduce((a, b) => a + b, 0);
  const meanPrizeUsd = amounts.length && prizeCount ? cashTotal / prizeCount : f.totalPrizeUsd && prizeCount ? f.totalPrizeUsd / prizeCount : null;

  let competitors: number | null = f.submissionCount ?? null;
  let competitorsEstimated = false;
  if (competitors == null && f.registrationCount) {
    competitors = Math.round(f.registrationCount * SUBMIT_RATE);
    competitorsEstimated = true;
  }

  let winProbability: number | null = null;
  if (prizeCount) {
    // You are one more entrant on top of the existing competitors.
    winProbability = Math.min(1, prizeCount / ((competitors ?? 0) + 1));
  }

  const evUsd = nonCash ? 0 : winProbability != null && meanPrizeUsd != null ? winProbability * meanPrizeUsd : null;
  return {
    bestPrizeUsd,
    meanPrizeUsd,
    prizeCount,
    competitors,
    competitorsEstimated,
    winProbability,
    estimatedHours: hours,
    evUsd,
    evPerHourUsd: evUsd != null ? evUsd / hours : null,
  };
}

export function describeEV(ev: ExpectedValue): string {
  if (ev.evUsd == null) return "unknown (prize or competition data missing)";
  return `${ev.prizeCount} prizes, mean $${Math.round(ev.meanPrizeUsd ?? 0)}, ${ev.competitors ?? "?"}${ev.competitorsEstimated ? " (estimated)" : ""} competitors, P(win)≈${((ev.winProbability ?? 0) * 100).toFixed(1)}%, ~${ev.estimatedHours}h → EV $${ev.evUsd.toFixed(0)} ($${(ev.evPerHourUsd ?? 0).toFixed(1)}/h)`;
}

// Display-only helpers. They read an AnalysisResult; they never change a verdict.
import type { AnalysisResult, Verdict } from "@/lib/shield/types";

const PENALTY = { critical: 45, high: 20, medium: 8, low: 2 } as const;
const CEILING: Record<Verdict, number> = { APPLY: 100, CAUTION: 70, AVOID: 35 };
const FLOOR: Record<Verdict, number> = { APPLY: 71, CAUTION: 36, AVOID: 0 };

/**
 * Trust score 0–100 for the gauge: 100 minus a penalty per red flag, clamped into the band of the
 * verdict (AVOID ≤ 35, CAUTION 36–70, APPLY ≥ 71) so the number always agrees with the badge.
 */
export function trustScore(r: Pick<AnalysisResult, "verdict" | "flags">): number {
  const raw = 100 - r.flags.reduce((sum, f) => sum + PENALTY[f.severity], 0);
  return Math.max(FLOOR[r.verdict], Math.min(CEILING[r.verdict], raw));
}

/** One plain-language sentence for the verdict, driven by the most important finding. */
export function plainWords(r: AnalysisResult): string {
  const has = (id: string) => r.flags.find((f) => f.id === id);
  if (r.verdict === "AVOID") {
    if (r.escalation?.accepted && r.escalation.criterion === "user_ineligible") return "Skip it: you're not eligible for this one.";
    if (has("blacklist")) return "Skip it: it's on your blacklist.";
    if (has("region-mismatch")) return `Skip it: this listing is only open to people in ${r.eligibility.region ?? "another region"}.`;
    if (has("test-bounty")) return "Skip it: it calls itself a test bounty, and payment is arranged by DM.";
    if (has("engagement-farming")) return "Skip it: it pays you to star the repo, not to do real work.";
    if (has("pr-flood")) return "Skip it: this repo is a bounty farm with thousands of copycat PRs.";
    if (has("non-cash-prize")) return "Skip it: the “prize” is services or credits, not money you can withdraw.";
    if (has("offplatform-payment")) return "Skip it: payment happens off-platform with no escrow.";
    if (r.escalation?.accepted && r.escalation.criterion === "prize_not_money") return "Skip it: most of the advertised prize isn't actually cash.";
    return "Skip it: the checks found problems serious enough to walk away.";
  }
  if (r.verdict === "CAUTION") {
    const bits: string[] = [];
    if (has("token-promotion")) bits.push("you'd be promoting a token sale");
    if (has("listing-changed")) bits.push("the terms changed after publishing");
    if (has("unverified-sponsor")) bits.push("the sponsor isn't verified");
    if (has("engagement-judging")) bits.push("likes decide the winner");
    if (has("competition-ratio") && r.ev.competitors && r.ev.prizeCount) bits.push(`${r.ev.competitors} people compete for ${r.ev.prizeCount} prizes`);
    const list = bits.slice(0, 2).join(" and ");
    return list ? `Be careful: real money, but ${list}.` : "Be careful: it's real, but there are risks worth weighing.";
  }
  const best = r.ev.bestPrizeUsd ? ` with up to $${r.ev.bestPrizeUsd.toLocaleString("en-US")} in cash` : "";
  return `Go for it: you're eligible, it's legit${best}, and nothing looks off.`;
}

/** Groups parked scan items by a short reason ("Deadline has passed", "Test bounty", …). */
export function groupBy<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    map.set(k, [...(map.get(k) ?? []), it]);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

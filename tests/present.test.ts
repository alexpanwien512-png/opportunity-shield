import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { CASES, DEMO_PROFILE } from "../fixtures/cases";
import { analyzeUrl } from "@/lib/shield/analyze";
import { loadRecording, replayIO } from "@/lib/shield/io";
import { plainWords, trustScore } from "@/lib/ui/present";
import type { RedFlag } from "@/lib/shield/types";

const flag = (severity: RedFlag["severity"]): RedFlag => ({ id: "x", label: "x", severity, explanation: "", evidence: [] });

describe("trust score (display only)", () => {
  it("always lands in the verdict's band", () => {
    expect(trustScore({ verdict: "APPLY", flags: [] })).toBe(100);
    expect(trustScore({ verdict: "APPLY", flags: [flag("high"), flag("high")] })).toBeGreaterThanOrEqual(71);
    expect(trustScore({ verdict: "CAUTION", flags: [] })).toBe(70);
    expect(trustScore({ verdict: "CAUTION", flags: [flag("critical"), flag("critical")] })).toBe(36);
    expect(trustScore({ verdict: "AVOID", flags: [flag("medium")] })).toBe(35);
    expect(trustScore({ verdict: "AVOID", flags: [flag("critical"), flag("critical"), flag("critical")] })).toBe(0);
  });
});

describe("plain words for the 7 demo cases", () => {
  const expectations: Record<string, RegExp> = {
    "gh-star-farm-poem": /^Skip it: it pays you to star the repo/,
    "gh-recursive-farm": /^Skip it: it pays you to star the repo/,
    "gh-test-bounty-dm": /^Skip it: it calls itself a test bounty/,
    "st-regional-de": /^Skip it: this listing is only open to people in Germany\.$/,
    "st-non-cash-audit": /^Skip it: the “prize” is services or credits/,
    "st-token-promo": /^Be careful: real money, but you'd be promoting a token sale/,
    "dp-nebius": /^Go for it: you're eligible/,
  };
  for (const c of CASES) {
    const file = `fixtures/cases/${c.id}.json`;
    (fs.existsSync(file) ? it : it.skip)(c.id, async () => {
      const r = await analyzeUrl(c.url, { io: replayIO(loadRecording(file)), profile: DEMO_PROFILE, models: { fast: "f", reasoning: "r" } });
      expect(plainWords(r)).toMatch(expectations[c.id]);
      const score = trustScore(r);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  }
});

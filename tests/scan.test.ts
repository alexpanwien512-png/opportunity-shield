import { describe, expect, it } from "vitest";
import { bucketFor, listingUrl, prefilter, scan, sortItems, triage, type Candidate, type ScanEvent } from "@/lib/shield/scan";
import { toIsoDate } from "@/lib/shield/analyze";
import type { IO } from "@/lib/shield/io";
import { DEFAULT_PROFILE } from "@/lib/shield/profile";
import type { AnalysisResult, Verdict } from "@/lib/shield/types";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const DAY = 86_400_000;

function result(verdict: Verdict, deadlineInDays: number | null, evPerHourUsd: number | null = null): AnalysisResult {
  return {
    url: "https://x.devpost.com", platform: "devpost", title: "X", sponsor: null, verdict, gateVerdict: verdict, modelVerdict: verdict,
    escalation: null, summary: "", reasons: [], eligibility: { eligible: true, region: null, online: true, preconditions: [], notes: [] },
    deadline: deadlineInDays == null ? null : new Date(NOW + deadlineInDays * DAY).toISOString(), prizes: [],
    flags: verdict === "AVOID" ? [{ id: "test-bounty", label: "Test bounty", severity: "critical", explanation: "", evidence: [] }] : [],
    ev: { bestPrizeUsd: null, meanPrizeUsd: null, prizeCount: null, competitors: null, competitorsEstimated: false, winProbability: null, estimatedHours: 10, evUsd: null, evPerHourUsd },
    models: { fast: "f", reasoning: "r" }, sources: [], timingsMs: {}, analyzedAt: new Date(NOW).toISOString(), pipelineVersion: 5,
  };
}

describe("buckets", () => {
  const b = (r: AnalysisResult) => bucketFor(r, DEFAULT_PROFILE, NOW).bucket;
  it("APPLY closing within 3 weeks → NOW", () => expect(b(result("APPLY", 9))).toBe("NOW"));
  it("APPLY later or undated → NEXT", () => {
    expect(b(result("APPLY", 40))).toBe("NEXT");
    expect(b(result("APPLY", null))).toBe("NEXT");
  });
  it("CAUTION worth ≥ 25% of the hourly rate → NEXT, else PARK", () => {
    expect(b(result("CAUTION", 10, 20))).toBe("NEXT");
    expect(b(result("CAUTION", 10, 0.3))).toBe("PARK");
  });
  it("AVOID or expired → PARK", () => {
    expect(b(result("AVOID", 10))).toBe("PARK");
    expect(b(result("APPLY", -1))).toBe("PARK");
  });
  it("sorts NOW first, then by deadline", () => {
    const items = [
      { bucket: "PARK", deadline: null, evPerHourUsd: 0 },
      { bucket: "NOW", deadline: "2026-10-30", evPerHourUsd: 1 },
      { bucket: "NOW", deadline: "2026-10-23", evPerHourUsd: 1 },
    ].map((x, i) => ({ ...x, url: String(i), title: "", platform: "", sponsor: null, verdict: "APPLY" as Verdict, why: "", bestPrizeUsd: null, topFlag: null, cached: false })) as Parameters<typeof sortItems>[0];
    expect(sortItems(items).map((i) => i.url)).toEqual(["2", "1", "0"]);
  });
});

describe("deadline parsing", () => {
  it.each([
    ["Oct 16 - 24, 2026", "2026-10-24"],
    ["Aug 26 - Oct 30, 2026", "2026-10-30"],
    ["Dec 30, 2026 - Jan 5, 2027", "2027-01-05"],
    ["October 21, 2026 - as scheduled by the sponsor.", "2026-10-21"],
    ["2026-11-14T18:29:59.000Z", "2026-11-14"],
  ])("%s → %s", (text, day) => expect(toIsoDate(text)?.slice(0, 10)).toBe(day));
  it("returns null for prose", () => expect(toIsoDate("soon")).toBeNull());
});

describe("listing URLs", () => {
  it.each([
    ["https://superteam.fun/earn/listing/chimp-on-metaplex/?tab=details", "https://superteam.fun/earn/listing/chimp-on-metaplex"],
    ["https://nebiusglobalaihackathon.devpost.com/rules", "https://nebiusglobalaihackathon.devpost.com"],
    ["https://devpost.com/software/runway-57dpic", null],
    ["https://superteam.fun/earn/all", null],
    ["not a url", null],
  ])("%s → %s", (raw, expected) => expect(listingUrl(raw)).toBe(expected));
});

function fakeIO(overrides: Partial<IO> = {}): IO {
  return {
    httpJson: async () => { throw new Error("offline"); },
    tavilyExtract: async () => null,
    tavilySearch: async () => [],
    llmJson: async () => ({ decisions: [] }),
    ...overrides,
  };
}

describe("prefilter (deterministic)", () => {
  it("drops expired and region-locked listings using platform facts", async () => {
    const io = fakeIO({
      httpJson: async (url) => (url.endsWith("/de-only") ? { status: "OPEN", region: "Germany", deadline: "2026-12-01T00:00:00Z" } : { status: "OPEN", region: "Europe", deadline: "2026-12-01T00:00:00Z" }),
    });
    const cands: Candidate[] = [
      { url: "https://superteam.fun/earn/listing/de-only", title: "", snippet: "", source: "superteam:api" },
      { url: "https://superteam.fun/earn/listing/eu", title: "", snippet: "", source: "superteam:api" },
      { url: "https://old.devpost.com", title: "", snippet: "", source: "devpost:api", deadline: "2026-10-01T00:00:00Z", region: "Online" },
    ];
    const { kept, dropped } = await prefilter(io, DEFAULT_PROFILE, cands, NOW);
    expect(kept.map((k) => k.url)).toEqual(["https://superteam.fun/earn/listing/eu"]);
    expect(dropped.map((d) => d.reason).sort()).toEqual(["Deadline has passed", "Restricted to Germany"]);
  });
});

describe("triage (Nemotron fast)", () => {
  const cands: Candidate[] = ["a", "b", "c"].map((x) => ({ url: `https://${x}.devpost.com`, title: x, snippet: "", source: "devpost:api" }));
  it("follows the model's ranking, keeps unknowns, and applies the limit", async () => {
    const io = fakeIO({ llmJson: async () => ({ decisions: [{ url: "https://c.devpost.com", keep: true, reason: "best" }, { url: "https://a.devpost.com", keep: false, reason: "video editing" }] }) });
    const { kept, dropped } = await triage(io, "m", DEFAULT_PROFILE, cands, 1);
    expect(kept.map((k) => k.url)).toEqual(["https://c.devpost.com"]);
    expect(dropped.map((d) => d.reason)).toEqual(["video editing", "over the scan limit of 1"]);
  });
});

describe("scan stream", () => {
  it("emits discovery, triage, per-item results and a sorted summary", async () => {
    const io = fakeIO({
      tavilySearch: async () => [{ title: "Hack", url: "https://hack.devpost.com/rules", content: "online" }],
      llmJson: async () => ({ decisions: [{ url: "https://hack.devpost.com", keep: true, reason: "fits" }] }),
    });
    const events: ScanEvent[] = [];
    for await (const e of scan({ io, profile: DEFAULT_PROFILE, blacklist: [], fastModel: "m", analyze: async () => result("APPLY", 5) })) events.push(e);
    expect(events.map((e) => e.type)).toEqual(["searching", "discovered", "triaged", "analyzing", "result", "done"]);
    const done = events.at(-1) as Extract<ScanEvent, { type: "done" }>;
    expect(done.items[0].verdict).toBe("APPLY");
  });

  it("reports a failed analysis without stopping the scan", async () => {
    const io = fakeIO({ tavilySearch: async () => [{ title: "A", url: "https://a.devpost.com", content: "" }, { title: "B", url: "https://b.devpost.com", content: "" }] });
    const events: ScanEvent[] = [];
    const analyze = async (url: string) => {
      if (url.includes("a.")) throw new Error("boom");
      return result("APPLY", 30);
    };
    for await (const e of scan({ io, profile: DEFAULT_PROFILE, blacklist: [], fastModel: "m", analyze })) events.push(e);
    expect(events.filter((e) => e.type === "failed")).toHaveLength(1);
    expect((events.at(-1) as Extract<ScanEvent, { type: "done" }>).items).toHaveLength(1);
  });
});

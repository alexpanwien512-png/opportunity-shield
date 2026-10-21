import { describe, expect, it } from "vitest";
import { Store } from "@/lib/shield/store";
import { analyzeWithMemory } from "@/lib/shield/service";
import { loadRecording, replayIO } from "@/lib/shield/io";
import { DEFAULT_PROFILE } from "@/lib/shield/profile";

const ISSUE = "https://github.com/SecureBananaLabs/bug-bounty/issues/76";
const fixtureIO = () => replayIO(loadRecording("fixtures/cases/gh-star-farm-poem.json"));
const A = "owner-a";
const B = "owner-b";

describe("store", () => {
  it("returns the default profile until one is saved, then persists it", () => {
    const db = new Store(":memory:");
    expect(db.hasProfile(A)).toBe(false);
    expect(db.getProfile(A).residenceCountry).toBe(DEFAULT_PROFILE.residenceCountry);
    db.saveProfile(A, { ...DEFAULT_PROFILE, residenceCountry: "Romania" });
    expect(db.getProfile(A).residenceCountry).toBe("Romania");
    expect(db.hasProfile(A)).toBe(true);
  });

  it("keeps each visitor's memory separate", () => {
    const db = new Store(":memory:");
    db.saveProfile(A, { ...DEFAULT_PROFILE, residenceCountry: "Romania" });
    db.addBlacklist(A, "bad/repo", "repo");
    db.saveRuleOverride(A, "attempt-flood", { enabled: false });
    expect(db.getProfile(B).residenceCountry).toBe(DEFAULT_PROFILE.residenceCountry);
    expect(db.blacklistValues(B)).toEqual([]);
    expect(db.getRules(B).find((r) => r.id === "attempt-flood")!.enabled).toBe(true);
  });

  it("normalizes blacklist values", () => {
    const db = new Store(":memory:");
    db.addBlacklist(A, "  SecureBananaLabs/Bug-Bounty ", "repo", "star farm");
    expect(db.blacklistValues(A)).toEqual(["securebananalabs/bug-bounty"]);
    db.removeBlacklist(A, "securebananalabs/bug-bounty");
    expect(db.blacklistValues(A)).toEqual([]);
  });

  it("applies rule overrides on top of defaults and validates them", () => {
    const db = new Store(":memory:");
    db.saveRuleOverride(A, "attempt-flood", { params: { max: 100 }, severity: "low" });
    const rule = db.getRules(A).find((r) => r.id === "attempt-flood")!;
    expect(rule.params.max).toBe(100);
    expect(rule.severity).toBe("low");
    expect(() => db.saveRuleOverride(A, "token-promotion", { params: { pattern: "(unclosed" } })).toThrow();
    expect(() => db.saveRuleOverride(A, "nope", { enabled: false })).toThrow();
    expect(() => db.saveRuleOverride(A, "attempt-flood", { params: { unknown: 1 } })).toThrow();
    db.resetRule(A, "attempt-flood");
    expect(db.getRules(A).find((r) => r.id === "attempt-flood")!.params.max).toBe(20);
  });
});

describe("analyzeWithMemory", () => {
  it("saves to history and serves the cached analysis next time", async () => {
    const db = new Store(":memory:");
    const first = await analyzeWithMemory(A, ISSUE, { db, io: fixtureIO() });
    expect(first.cached).toBe(false);
    expect(db.listHistory(A)).toHaveLength(1);
    // No IO at all: a cache miss would throw on the empty replay.
    const second = await analyzeWithMemory(A, ISSUE, { db, io: replayIO({}) });
    expect(second.cached).toBe(true);
    expect(second.verdict).toBe(first.verdict);
  });

  it("shares the cache between visitors with the same inputs, but not across profiles", async () => {
    const db = new Store(":memory:");
    await analyzeWithMemory(A, ISSUE, { db, io: fixtureIO() });
    expect((await analyzeWithMemory(B, ISSUE, { db, io: replayIO({}) })).cached).toBe(true);
    expect(db.listHistory(B)).toHaveLength(1);
    db.saveProfile(B, { ...DEFAULT_PROFILE, residenceCountry: "Germany" });
    const fresh = await analyzeWithMemory(B, ISSUE, { db, io: fixtureIO() });
    expect(fresh.cached).toBe(false);
  });

  it("only spends a live-run token on a cache miss", async () => {
    const db = new Store(":memory:");
    let tokens = 0;
    const beforeLiveRun = async () => void tokens++;
    await analyzeWithMemory(A, ISSUE, { db, io: fixtureIO(), beforeLiveRun });
    await analyzeWithMemory(A, ISSUE, { db, io: fixtureIO(), beforeLiveRun });
    expect(tokens).toBe(1);
  });

  it("uses the blacklist and edited rules from memory", async () => {
    const db = new Store(":memory:");
    db.addBlacklist(A, "SecureBananaLabs/bug-bounty", "repo");
    db.saveRuleOverride(A, "engagement-farming", { enabled: false });
    const r = await analyzeWithMemory(A, ISSUE, { db, io: fixtureIO() });
    const ids = r.flags.map((f) => f.id);
    expect(ids).toContain("blacklist");
    expect(ids).not.toContain("engagement-farming");
  });
});

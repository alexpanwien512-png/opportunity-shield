import { describe, expect, it } from "vitest";
import { Store } from "@/lib/shield/store";
import { analyzeWithMemory } from "@/lib/shield/service";
import { loadRecording, replayIO } from "@/lib/shield/io";
import { DEFAULT_PROFILE } from "@/lib/shield/profile";

const ISSUE = "https://github.com/SecureBananaLabs/bug-bounty/issues/76";
const fixtureIO = () => replayIO(loadRecording("fixtures/cases/gh-star-farm-poem.json"));

describe("store", () => {
  it("returns the default profile until one is saved, then persists it", () => {
    const db = new Store(":memory:");
    expect(db.hasProfile()).toBe(false);
    expect(db.getProfile().residenceCountry).toBe(DEFAULT_PROFILE.residenceCountry);
    db.saveProfile({ ...DEFAULT_PROFILE, residenceCountry: "Romania" });
    expect(db.getProfile().residenceCountry).toBe("Romania");
    expect(db.hasProfile()).toBe(true);
  });

  it("normalizes blacklist values", () => {
    const db = new Store(":memory:");
    db.addBlacklist("  SecureBananaLabs/Bug-Bounty ", "repo", "star farm");
    expect(db.blacklistValues()).toEqual(["securebananalabs/bug-bounty"]);
    db.removeBlacklist("securebananalabs/bug-bounty");
    expect(db.blacklistValues()).toEqual([]);
  });

  it("applies rule overrides on top of defaults and validates them", () => {
    const db = new Store(":memory:");
    db.saveRuleOverride("attempt-flood", { params: { max: 100 }, severity: "low" });
    const rule = db.getRules().find((r) => r.id === "attempt-flood")!;
    expect(rule.params.max).toBe(100);
    expect(rule.severity).toBe("low");
    expect(() => db.saveRuleOverride("token-promotion", { params: { pattern: "(unclosed" } })).toThrow();
    expect(() => db.saveRuleOverride("nope", { enabled: false })).toThrow();
    expect(() => db.saveRuleOverride("attempt-flood", { params: { unknown: 1 } })).toThrow();
    db.resetRule("attempt-flood");
    expect(db.getRules().find((r) => r.id === "attempt-flood")!.params.max).toBe(20);
  });
});

describe("analyzeWithMemory", () => {
  it("saves to history and serves the cached analysis next time", async () => {
    const db = new Store(":memory:");
    const first = await analyzeWithMemory(ISSUE, { db, io: fixtureIO() });
    expect(first.cached).toBe(false);
    expect(db.listHistory()).toHaveLength(1);
    // No IO at all: a cache miss would throw on the empty replay.
    const second = await analyzeWithMemory(ISSUE, { db, io: replayIO({}) });
    expect(second.cached).toBe(true);
    expect(second.verdict).toBe(first.verdict);
  });

  it("uses the blacklist and edited rules from memory", async () => {
    const db = new Store(":memory:");
    db.addBlacklist("SecureBananaLabs/bug-bounty", "repo");
    db.saveRuleOverride("engagement-farming", { enabled: false });
    const r = await analyzeWithMemory(ISSUE, { db, io: fixtureIO(), force: true });
    const ids = r.flags.map((f) => f.id);
    expect(ids).toContain("blacklist");
    expect(ids).not.toContain("engagement-farming");
  });
});

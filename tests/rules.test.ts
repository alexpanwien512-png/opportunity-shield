import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, gateVerdict, isVerbatim, quoteFor, runRules, stricter, type RuleContext } from "@/lib/shield/rules";
import { escalationProven } from "@/lib/shield/analyze";
import type { PlatformFacts, RedFlag } from "@/lib/shield/types";
import { DEMO_PROFILE } from "../fixtures/cases";

function ctx(text: string, facts: Partial<PlatformFacts> = {}, blacklist: string[] = []): RuleContext {
  return {
    bundle: { url: "https://example.com/x", platform: facts.platform ?? "web", text, facts: { platform: "web", ...facts }, sponsorResearch: [], fetchedWith: [] },
    extraction: null,
    profile: DEMO_PROFILE,
    blacklist,
  };
}
const ids = (c: RuleContext) => runRules(c).map((f) => f.id);
const flag = (severity: RedFlag["severity"]): RedFlag => ({ id: "x", label: "x", severity, explanation: "", evidence: [] });

describe("gate", () => {
  it("any critical → AVOID", () => expect(gateVerdict([flag("critical")])).toBe("AVOID"));
  it("three highs → AVOID", () => expect(gateVerdict([flag("high"), flag("high"), flag("high")])).toBe("AVOID"));
  it("one high → CAUTION", () => expect(gateVerdict([flag("high")])).toBe("CAUTION"));
  it("two mediums → CAUTION", () => expect(gateVerdict([flag("medium"), flag("medium")])).toBe("CAUTION"));
  it("one medium + lows → APPLY", () => expect(gateVerdict([flag("medium"), flag("low"), flag("low")])).toBe("APPLY"));
  it("model can only be stricter", () => {
    expect(stricter("CAUTION", "APPLY")).toBe("CAUTION");
    expect(stricter("CAUTION", "AVOID")).toBe("AVOID");
  });
});

describe("evidence", () => {
  it("quotes the matching line", () => {
    expect(quoteFor("intro\nImportant: Star the repository now\nend", /star the repo/i)).toBe("Important: Star the repository now");
  });
  it("verbatim check ignores whitespace and case, rejects paraphrase", () => {
    expect(isVerbatim("star  the REPOSITORY now", "Important: Star the repository now")).toBe(true);
    expect(isVerbatim("please give us a star", "Important: Star the repository now")).toBe(false);
  });
});

describe("rules — positives", () => {
  it("star/follow farming", () => expect(ids(ctx("Important: Star the repository https://github.com/x/y"))).toContain("engagement-farming"));
  it("follow our account", () => expect(ids(ctx("To qualify, follow our account on X."))).toContain("engagement-farming"));
  it("test bounty", () => expect(ids(ctx("# [TEST BOUNTY] Fix typo"))).toContain("test-bounty"));
  it("payment by DM", () => expect(ids(ctx("**Contact:** DM for payment details"))).toContain("offplatform-payment"));
  it("presale promotion", () => expect(ids(ctx("the $CHIMP is having a FAIR launching on Raydium. Join the presale"))).toContain("token-promotion"));
  it("non-cash audit services", () => expect(ids(ctx("Each grant is worth up to 4,000 USDC in audit services. It is not paid out as cash."))).toContain("non-cash-prize"));
  it("engagement judging", () => expect(ids(ctx("Engagement: Likes and reposts count, but quality comes first."))).toContain("engagement-judging"));
  it("regional listing outside the user's country", () => expect(ids(ctx("x", { region: "Germany" }))).toContain("region-mismatch"));
  it("rules text excluding the user's country", () =>
    expect(ids(ctx("Residents of Cuba, Iran and Austria are not eligible."))).toContain("region-mismatch"));
  it("blacklisted repo", () => expect(ids(ctx("x", { repo: "Bad/Repo" }, ["bad/repo"]))).toContain("blacklist"));
  it("PR flood in a young repo", () => {
    const created = new Date(Date.now() - 100 * 86_400_000).toISOString();
    expect(ids(ctx("x", { repoCreatedAt: created, repoPullRequests: 5000, repoOpenIssues: 10 }))).toContain("pr-flood");
  });
});

describe("rules — no false positives on a normal hackathon", () => {
  const devpost =
    "Build with Nebius Token Factory and NVIDIA Nemotron. Prizes: $10,000 cash plus $5,000 in Token Factory credits. " +
    "Judging: technical implementation, impact, design. Open to participants worldwide, except where prohibited by law. " +
    "Follow the official rules. Projects must be newly created during the submission period.";
  const got = ids(ctx(devpost, { platform: "devpost", region: "Global", sponsorVerified: true, prizeCount: 10, registrationCount: 25000 }));
  it.each(["token-promotion", "non-cash-prize", "engagement-farming", "region-mismatch", "precondition-existing-project", "engagement-judging", "unverified-sponsor"])(
    "does not flag %s",
    (id) => expect(got).not.toContain(id),
  );
  it("large field is only a low-severity note", () => {
    const f = runRules(ctx(devpost, { platform: "devpost", region: "Global", prizeCount: 10, registrationCount: 25000 })).find((x) => x.id === "competition-ratio");
    expect(f?.severity).toBe("low");
  });
  it("Europe-wide listing includes Austria", () => expect(ids(ctx("x", { region: "Europe" }))).not.toContain("region-mismatch"));
});

describe("escalation proof", () => {
  const text = "Build on Nebius Token Factory. Join the $CHIMP presale today. Open to high school students aged 14-19 only.";
  const base = { text, flags: [] as RedFlag[], sponsorVerified: true, rules: DEFAULT_RULES };
  it("rejects a verbatim but irrelevant quote for token promotion", () =>
    expect(escalationProven({ criterion: "token_promotion", quote: "Nebius Token Factory" }, base)).toBe(false));
  it("accepts a quote that matches the token-promotion pattern", () =>
    expect(escalationProven({ criterion: "token_promotion", quote: "Join the $CHIMP presale today" }, base)).toBe(true));
  it("needs the platform fact for an unverified sponsor", () => {
    expect(escalationProven({ criterion: "unverified_sponsor", quote: "Build on Nebius Token Factory" }, base)).toBe(false);
    expect(escalationProven({ criterion: "unverified_sponsor", quote: "Build on Nebius Token Factory" }, { ...base, sponsorVerified: false })).toBe(true);
  });
  it("needs a real sentence for AVOID criteria", () => {
    expect(escalationProven({ criterion: "user_ineligible", quote: "high school students" }, base)).toBe(false);
    expect(escalationProven({ criterion: "user_ineligible", quote: "Open to high school students aged 14-19 only." }, base)).toBe(true);
  });
  it("rejects quotes that are not on the page", () =>
    expect(escalationProven({ criterion: "user_ineligible", quote: "Only residents of Mars may enter this contest" }, base)).toBe(false));
});

// Deterministic red-flag rules. Each rule is a "skill": its params, severity
// and on/off switch are editable data (stored in SQLite), its logic is code.
// Every flag must carry evidence: a verbatim quote found in the fetched page,
// or a fact read from a platform API.
import type { Evidence, Extraction, Profile, RedFlag, Severity, SourceBundle, Verdict } from "./types";

export interface RuleContext {
  bundle: SourceBundle;
  extraction: Extraction | null;
  profile: Profile;
  blacklist: string[]; // lower-cased repo slugs, sponsor names or domains
}

export interface RuleSpec {
  id: string;
  label: string;
  description: string;
  severity: Severity;
  enabled: boolean;
  params: Record<string, string | number>;
}

type Detector = (ctx: RuleContext, spec: RuleSpec) => { explanation: string; evidence: Evidence[]; severity?: Severity } | null;

// ---------- evidence helpers ----------

/** Returns the line (trimmed to ~240 chars around the match) that contains the first match. */
export function quoteFor(text: string, pattern: RegExp): string | null {
  const re = new RegExp(pattern.source, pattern.flags.replace("g", ""));
  const m = re.exec(text);
  if (!m) return null;
  const lineStart = text.lastIndexOf("\n", m.index) + 1;
  const lineEndRaw = text.indexOf("\n", m.index + m[0].length);
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw;
  let start = lineStart;
  let end = lineEnd;
  if (end - start > 240) {
    start = Math.max(lineStart, m.index - 100);
    end = Math.min(lineEnd, m.index + m[0].length + 100);
  }
  return text.slice(start, end).trim();
}

/** True when the quote appears verbatim (whitespace-insensitive) in the text. */
export function isVerbatim(quote: string, text: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return quote.trim().length >= 8 && norm(text).includes(norm(quote));
}

function pageEvidence(ctx: RuleContext, pattern: RegExp): Evidence[] {
  const q = quoteFor(ctx.bundle.text, pattern);
  return q ? [{ quote: q, source: "page" }] : [];
}

function apiEvidence(ctx: RuleContext, quote: string): Evidence {
  return { quote, source: `${ctx.bundle.platform}:api` };
}

const rx = (s: string | number) => new RegExp(String(s), "i");

function ageDays(iso?: string): number | null {
  if (!iso) return null;
  return Math.max(1, (Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** A page line that ties the listing to a region ("Highlight a Germany angle", "residents of X only"). */
function regionLinePattern(region: string): RegExp {
  const r = region.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(only|restricted|residents|based|angle|located)[^\\n]{0,80}\\b${r}\\b|\\b${r}\\b[^\\n]{0,80}\\b(only|angle|residents|based)\\b`, "i");
}

const sameCountry =(a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Region labels that name a group of countries rather than one country.
const REGION_GROUPS: Record<string, string[]> = {
  europe: ["austria", "germany", "romania", "france", "italy", "spain", "poland", "netherlands", "portugal", "ireland", "belgium", "czechia", "greece", "sweden", "denmark", "finland", "hungary", "bulgaria", "croatia", "slovakia", "slovenia", "uk", "united kingdom", "switzerland", "norway"],
  dach: ["germany", "austria", "switzerland"],
  balkans: ["romania", "bulgaria", "serbia", "croatia", "bosnia", "albania", "north macedonia", "montenegro", "slovenia", "greece"],
};

function regionIncludes(region: string, country: string): boolean {
  const r = region.toLowerCase();
  if (/global|worldwide|anywhere|online/.test(r)) return true;
  if (r.split(/[,/&]| and /).some((part) => sameCountry(part, country))) return true;
  return Object.entries(REGION_GROUPS).some(([k, list]) => r.includes(k) && list.includes(country.toLowerCase()));
}

// ---------- detectors ----------

const detectors: Record<string, Detector> = {
  "engagement-farming": (ctx, spec) => {
    const ev = pageEvidence(ctx, rx(spec.params.pattern));
    return ev.length ? { explanation: "The listing asks for stars/follows/forks — engagement farming, not work.", evidence: ev } : null;
  },

  "test-bounty": (ctx, spec) => {
    const ev = pageEvidence(ctx, rx(spec.params.pattern));
    return ev.length ? { explanation: "Self-declared test bounty: nothing guarantees a payout.", evidence: ev } : null;
  },

  "offplatform-payment": (ctx, spec) => {
    // Superteam and Devpost pay through the platform; only flag explicit off-platform payment there.
    const ev = pageEvidence(ctx, rx(spec.params.pattern));
    if (!ev.length) return null;
    const escrow = rx(spec.params.escrowPattern).test(ctx.bundle.text);
    return {
      explanation: "Payment is arranged by DM / Telegram / crypto outside any escrow — classic bait.",
      evidence: ev,
      severity: escrow ? "medium" : spec.severity,
    };
  },

  "absurd-reward": (ctx, spec) => {
    const amount = Math.max(0, ...(ctx.bundle.facts.prizes ?? []).map((p) => p.amount ?? 0));
    const trivial = quoteFor(ctx.bundle.facts.title ?? "", rx(spec.params.trivialPattern));
    if (!trivial || amount < Number(spec.params.minAmount)) return null;
    return {
      explanation: `$${amount} for a trivial task ("${trivial}") is far above market rate — used as bait for engagement.`,
      evidence: [apiEvidence(ctx, `title: "${ctx.bundle.facts.title}", reward: $${amount}`)],
    };
  },

  "non-technical-in-code-repo": (ctx, spec) => {
    if (ctx.bundle.platform !== "github") return null;
    const title = ctx.bundle.facts.title ?? "";
    const byKeyword = rx(spec.params.pattern).test(title);
    // "content" is too broad (a README typo is content); only trust the model for social-media tasks.
    const byModel = ctx.extraction?.taskCategory === "social";
    if (!byKeyword && !byModel) return null;
    return {
      explanation: "A non-technical task (writing/social) posted as a bounty in a code repository.",
      evidence: [apiEvidence(ctx, `issue title: "${title}"`)],
    };
  },

  "attempt-flood": (ctx, spec) => {
    const n = ctx.bundle.facts.attemptCount ?? 0;
    if (n <= Number(spec.params.max)) return null;
    return {
      explanation: `${n} people already claimed this with /attempt — the odds of being paid are negligible.`,
      evidence: [apiEvidence(ctx, `${n} "/attempt" comments in the first ${ctx.bundle.facts.attemptSampleSize} comments (${ctx.bundle.facts.issueCommentCount} total)`)],
    };
  },

  "pr-flood": (ctx, spec) => {
    const f = ctx.bundle.facts;
    const days = ageDays(f.repoCreatedAt);
    if (!days) return null;
    const prsPerDay = (f.repoPullRequests ?? 0) / days;
    const issuesPerDay = (f.repoOpenIssues ?? 0) / days;
    if (prsPerDay < Number(spec.params.perDay) && issuesPerDay < Number(spec.params.perDay)) return null;
    return {
      explanation: `The repo is ${Math.round(days)} days old but has ${f.repoPullRequests} PRs and ${f.repoOpenIssues} open issues — a bounty farm, not a real project.`,
      evidence: [apiEvidence(ctx, `${f.repo}: created ${f.repoCreatedAt?.slice(0, 10)}, ${f.repoPullRequests} PRs (${prsPerDay.toFixed(0)}/day), ${f.repoOpenIssues} open issues`)],
    };
  },

  "bounty-command-only": (ctx) => {
    if (!ctx.bundle.facts.bountyOnlyInComment) return null;
    return {
      explanation: "The bounty exists only as a '/bounty $X' line — no escrow bot or platform confirmed it.",
      evidence: pageEvidence(ctx, /\/bounty\s+\$?\d[\d,]*/i),
    };
  },

  "region-mismatch": (ctx) => {
    const { residenceCountry } = ctx.profile;
    const region = ctx.bundle.facts.region ?? ctx.extraction?.regionRestriction ?? null;
    if (region && !regionIncludes(region, residenceCountry)) {
      const fromApi = !!ctx.bundle.facts.region;
      return {
        explanation: `Restricted to ${region}; you live in ${residenceCountry}.`,
        evidence: fromApi
          ? [apiEvidence(ctx, `region: "${region}"`), ...pageEvidence(ctx, regionLinePattern(region))]
          : extractionEvidence(ctx, "regionRestriction"),
      };
    }
    const excluded = pageEvidence(ctx, new RegExp(`(not eligible|excluded|cannot participate|residents of)[^\\n]{0,400}\\b${residenceCountry}\\b`, "i"));
    return excluded.length ? { explanation: `The rules exclude residents of ${residenceCountry}.`, evidence: excluded } : null;
  },

  "non-cash-prize": (ctx, spec) => {
    const strong = pageEvidence(ctx, rx(spec.params.strongPattern));
    if (strong.length) return { explanation: "The 'prize' is credits/services/discount — not money you can withdraw.", evidence: strong };
    const prizes = ctx.extraction?.prizes ?? [];
    const nonCash = prizes.filter((p) => ["credits", "services", "discount", "merch"].includes(p.kind));
    if (prizes.length && nonCash.length === prizes.length) {
      return { explanation: "All prizes are non-cash.", evidence: extractionEvidence(ctx, "prizes") };
    }
    return null;
  },

  "unverified-sponsor": (ctx) => {
    if (ctx.bundle.facts.sponsorVerified !== false) return null;
    return {
      explanation: `${ctx.bundle.facts.sponsorName} is not a verified sponsor on ${ctx.bundle.platform}.`,
      evidence: [apiEvidence(ctx, `sponsor "${ctx.bundle.facts.sponsorName}": isVerified=false`)],
    };
  },

  "sponsor-reputation": (ctx, spec) => {
    const name = ctx.bundle.facts.sponsorName;
    if (!name) return null;
    const hits = ctx.bundle.sponsorResearch.filter(
      (h) => h.content.toLowerCase().includes(name.toLowerCase()) && rx(spec.params.pattern).test(h.content),
    );
    if (!hits.length) return null;
    return {
      explanation: `Web search links ${name} to scam/rug reports.`,
      evidence: hits.slice(0, 2).map((h) => ({ quote: quoteFor(h.content, rx(spec.params.pattern)) ?? h.title, source: h.url })),
    };
  },

  "token-promotion": (ctx, spec) => {
    const ev = pageEvidence(ctx, rx(spec.params.pattern));
    return ev.length ? { explanation: "You are paid to promote a token sale — reputational and legal risk.", evidence: ev } : null;
  },

  "precondition-existing-project": (ctx, spec) => {
    const ev = pageEvidence(ctx, rx(spec.params.pattern));
    return ev.length ? { explanation: "Only teams with an existing project qualify.", evidence: ev } : null;
  },

  "engagement-judging": (ctx, spec) => {
    const ev = pageEvidence(ctx, rx(spec.params.pattern));
    return ev.length ? { explanation: "Judging rewards likes/reach — big audiences win, not quality.", evidence: ev } : null;
  },

  "competition-ratio": (ctx, spec) => {
    const f = ctx.bundle.facts;
    const prizes = f.prizeCount ?? 0;
    if (!prizes) return null;
    if (f.submissionCount) {
      const ratio = f.submissionCount / prizes;
      if (ratio <= Number(spec.params.maxRatio)) return null;
      return {
        explanation: `${f.submissionCount} submissions for ${prizes} prizes (${ratio.toFixed(0)}:1).`,
        evidence: [apiEvidence(ctx, `${f.submissionCount} submissions, ${prizes} prizes`)],
      };
    }
    if (f.registrationCount) {
      const est = f.registrationCount * Number(spec.params.submitRate);
      const ratio = est / prizes;
      if (ratio <= Number(spec.params.maxRatio)) return null;
      return {
        explanation: `${f.registrationCount} registered for ${prizes} prizes (~${Math.round(est)} expected submissions). Big field — normal for large hackathons.`,
        evidence: [apiEvidence(ctx, `${f.registrationCount} registrations, ${prizes} prizes`)],
        severity: "low",
      };
    }
    return null;
  },

  "listing-changed": (ctx) => {
    const changes = ctx.bundle.facts.snapshotChanges ?? [];
    if (!changes.length) return null;
    const prize = changes.find((c) => c.field === "total prizes");
    return {
      explanation: prize
        ? `The prize pool was changed from ${prize.snapshot} to ${prize.live} after the listing was published — bait-and-switch risk.`
        : "The listing was edited after it was published; check that the terms you read are the current ones.",
      evidence: changes.map((c) => ({ quote: `${c.field}: now "${c.live}", previously "${c.snapshot}"`, source: "superteam:api vs tavily:extract" })),
      severity: prize && Number(prize.live) < Number(prize.snapshot) ? "medium" : "low",
    };
  },

  blacklist: (ctx) => {
    const f = ctx.bundle.facts;
    const keys = [f.repo, f.sponsorName, f.sponsorUrl && new URL(f.sponsorUrl).hostname].filter(Boolean).map((s) => s!.toLowerCase());
    const hit = keys.find((k) => ctx.blacklist.includes(k));
    return hit ? { explanation: `"${hit}" is on your blacklist.`, evidence: [{ quote: hit, source: "memory:blacklist" }] } : null;
  },
};

function extractionEvidence(ctx: RuleContext, key: string): Evidence[] {
  const q = ctx.extraction?.quotes?.[key];
  return q && isVerbatim(q, ctx.bundle.text) ? [{ quote: q, source: "page" }] : [];
}

// ---------- default rule set (seeded into the DB, editable in the UI) ----------

export const DEFAULT_RULES: RuleSpec[] = [
  { id: "blacklist", label: "Blacklisted repo or sponsor", description: "Repo, sponsor or domain is on your blacklist.", severity: "critical", enabled: true, params: {} },
  { id: "engagement-farming", label: "Star / follow / fork farming", description: "Asks you to star, follow or fork as part of the task.", severity: "critical", enabled: true,
    params: { pattern: String.raw`\b(star|follow|fork)(\s+(and|&)\s+(star|follow|fork))?\s+(the|this|our|my)\s+(repo|repository|project|account|org|organization|page)\b` } },
  { id: "test-bounty", label: "Test bounty", description: "Listing calls itself a test bounty.", severity: "critical", enabled: true,
    params: { pattern: String.raw`\btest[\s-]bounty\b|\[test\]` } },
  { id: "offplatform-payment", label: "Payment via DM / Telegram / crypto without escrow", description: "Payment negotiated privately, outside any escrow.", severity: "critical", enabled: true,
    params: { pattern: String.raw`\b(dm|direct message|telegram|whatsapp|t\.me/)\b[^\n]{0,40}\b(pay|payment|reward|details)|\b(pay|payment|reward)[^\n]{0,40}\b(via|through|by)\s+(dm|telegram|whatsapp|crypto)\b|\bcontact\b[^\n]{0,15}\bdm\b`,
      escrowPattern: String.raw`\bescrow\b|algora|opire` } },
  { id: "absurd-reward", label: "Absurd reward for a trivial task", description: "Large amount for typo/poem/README-level work.", severity: "high", enabled: true,
    params: { trivialPattern: String.raw`\b(typo|poem|poetry|readme|rename|emoji|haiku)\b`, minAmount: 40 } },
  { id: "non-technical-in-code-repo", label: "Non-technical task in a code repo", description: "Writing or social task posted as a code bounty.", severity: "high", enabled: true,
    params: { pattern: String.raw`\b(poem|poetry|essay|story|tweet|thread|meme|song|haiku)\b` } },
  { id: "attempt-flood", label: "More than 20 /attempt claims", description: "Too many people already claimed the issue.", severity: "high", enabled: true, params: { max: 20 } },
  { id: "pr-flood", label: "PR volume out of proportion to repo age", description: "Thousands of PRs/issues in a young repo — a bounty farm.", severity: "critical", enabled: true, params: { perDay: 20 } },
  { id: "bounty-command-only", label: "Bounty only as a '/bounty $X' line", description: "No escrow bot or platform confirms the bounty.", severity: "medium", enabled: true, params: {} },
  { id: "region-mismatch", label: "Region outside your country", description: "Listing restricted to a region you are not in.", severity: "critical", enabled: true, params: {} },
  { id: "non-cash-prize", label: "Prize in credits, services or discount", description: "Reward cannot be withdrawn as money.", severity: "critical", enabled: true,
    params: { strongPattern: String.raw`not (be )?paid (out )?(as|in) cash|in [a-z ]{0,30}(audit|consulting|cloud) services|applied as a discount|paid (only )?in (credits|vouchers)` } },
  { id: "unverified-sponsor", label: "Unverified sponsor", description: "Platform has not verified the sponsor.", severity: "medium", enabled: true, params: {} },
  { id: "sponsor-reputation", label: "Sponsor linked to scam reports", description: "Tavily search finds scam/rug reports about the sponsor.", severity: "high", enabled: true,
    params: { pattern: String.raw`\b(scam|scammer|rug ?pull|rugged|fraud|never paid|didn'?t pay)\b` } },
  { id: "token-promotion", label: "Token / presale promotion", description: "Task is to promote a token launch or presale.", severity: "high", enabled: true,
    params: { pattern: String.raw`\b(pre-?sale|fair[\s-]launch|token sale|token generation event|tokenomics|\bTGE\b)` } },
  { id: "precondition-existing-project", label: "Requires an existing project", description: "Only teams with a prior project/hackathon entry qualify.", severity: "high", enabled: true,
    params: { pattern: String.raw`\b(projects?|teams?) (that|who) (took part|participated|competed) in|must (already )?have (an existing|a live|a deployed)|codebase is feature-complete` } },
  { id: "engagement-judging", label: "Judged on engagement", description: "Likes/reposts/views decide the winner.", severity: "medium", enabled: true,
    params: { pattern: String.raw`\b(likes|reposts|retweets|impressions|views)\b[^\n]{0,40}\b(count|matter|judg|score)|\bengagement\b[^\n]{0,20}:` } },
  { id: "listing-changed", label: "Listing edited after publication", description: "Live listing differs from the indexed snapshot (title or prize pool).", severity: "medium", enabled: true, params: {} },
  { id: "competition-ratio", label: "Disproportionate competition", description: "Far more submissions than prizes.", severity: "medium", enabled: true, params: { maxRatio: 15, submitRate: 0.08 } },
];

export function runRules(ctx: RuleContext, specs: RuleSpec[] = DEFAULT_RULES): RedFlag[] {
  const flags: RedFlag[] = [];
  for (const spec of specs) {
    if (!spec.enabled) continue;
    const detect = detectors[spec.id];
    if (!detect) continue;
    const hit = detect(ctx, spec);
    // A flag without evidence is not shown: no evidence, no accusation.
    if (!hit || hit.evidence.length === 0) continue;
    flags.push({ id: spec.id, label: spec.label, severity: hit.severity ?? spec.severity, explanation: hit.explanation, evidence: hit.evidence });
  }
  return flags;
}

export const KNOWN_RULE_IDS = Object.keys(detectors);

/** The verdict ceiling the deterministic rules allow. The model may lower it, never raise it. */
export function gateVerdict(flags: RedFlag[]): Verdict {
  const count = (s: Severity) => flags.filter((f) => f.severity === s).length;
  if (count("critical") > 0 || count("high") >= 3) return "AVOID";
  if (count("high") > 0 || count("medium") >= 2) return "CAUTION";
  return "APPLY";
}

const RANK: Record<Verdict, number> = { APPLY: 0, CAUTION: 1, AVOID: 2 };
export function stricter(a: Verdict, b: Verdict): Verdict {
  return RANK[a] >= RANK[b] ? a : b;
}

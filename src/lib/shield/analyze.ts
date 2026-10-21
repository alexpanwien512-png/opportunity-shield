// Orchestrates one analysis: fetch → extract (fast Nemotron) → rules → EV → verdict (reasoning Nemotron).
import type { IO } from "./io";
import { fetchSource } from "./sources";
import { extractFacts, judge, type ModelVerdict } from "./llm";
import { DEFAULT_RULES, gateVerdict, isVerbatim, runRules, stricter, type RuleSpec } from "./rules";
import { describeEV, expectedValue } from "./ev";
import type { AnalysisResult, Eligibility, Extraction, Profile, ProgressEvent, RedFlag, Verdict } from "./types";

/** Bump when rules, prompts or EV logic change: cached analyses from older versions are recomputed. */
export const PIPELINE_VERSION = 5;

export interface AnalyzeOptions {
  io: IO;
  profile: Profile;
  rules?: RuleSpec[];
  blacklist?: string[];
  models: { fast: string; reasoning: string };
  onProgress?: (e: ProgressEvent) => void;
}

const FALLBACK_SUMMARY: Record<Verdict, string> = {
  AVOID: "Deterministic checks found disqualifying problems.",
  CAUTION: "Real opportunity, but the checks found risks worth weighing.",
  APPLY: "No red flags found and you appear eligible.",
};

export async function analyzeUrl(url: string, opts: AnalyzeOptions): Promise<AnalysisResult> {
  const t: Record<string, number> = {};
  const time = async <T>(name: string, fn: () => Promise<T>) => {
    const s = performance.now();
    try {
      return await fn();
    } finally {
      t[name] = Math.round(performance.now() - s);
    }
  };

  const emit = (e: ProgressEvent) => {
    try {
      opts.onProgress?.(e);
    } catch {
      /* a broken listener must never break an analysis */
    }
  };

  emit({ step: "fetch", status: "start" });
  const bundle = await time("fetch", () => fetchSource(url, opts.io));
  const SOURCE: Record<string, string> = { "tavily:extract": "Tavily Extract", "tavily:search": "Tavily Search", "github:api": "GitHub API", "superteam:api": "Superteam API", "devpost:api": "Devpost API", "github:api-unavailable": "GitHub API (rate-limited)" };
  emit({ step: "fetch", status: "done", ms: t.fetch, detail: `Read ${(bundle.text.length / 1000).toFixed(1)}k characters · ${bundle.fetchedWith.map((x) => SOURCE[x] ?? x).join(" + ")}` });

  let extraction: Extraction | null = null;
  emit({ step: "extract", status: "start", detail: "Reading prizes, region, deadline and quotes…" });
  try {
    extraction = await time("extract", () => extractFacts(opts.io, opts.models.fast, bundle));
    const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
    emit({ step: "extract", status: "done", ms: t.extract, detail: `${n(extraction.prizes.length, "prize")}, ${n(Object.keys(extraction.quotes ?? {}).length, "verbatim quote")}` });
  } catch (err) {
    console.warn("extraction failed, continuing with platform facts only:", (err as Error).message);
    emit({ step: "extract", status: "skipped", ms: t.extract, detail: "Model unavailable — using platform facts" });
  }

  const ctx = { bundle, extraction, profile: opts.profile, blacklist: (opts.blacklist ?? []).map((b) => b.toLowerCase()) };
  const flags = runRules(ctx, opts.rules ?? DEFAULT_RULES);
  const ev = expectedValue(bundle, extraction, flags);
  const regionHit = flags.find((f) => f.id === "region-mismatch");
  emit({ step: "eligibility", status: "done", detail: regionHit ? regionHit.explanation : `Open to residents of ${opts.profile.residenceCountry}` });
  const bySev = (s: string) => flags.filter((f) => f.severity === s).length;
  emit({
    step: "flags",
    status: "done",
    detail: flags.length ? `${flags.length} red flag${flags.length > 1 ? "s" : ""}${bySev("critical") ? ` · ${bySev("critical")} critical` : ""}` : "No red flags",
  });

  let model: ModelVerdict | null = null;
  emit({ step: "verdict", status: "start", detail: "Weighing facts, red flags and your profile…" });
  try {
    model = await time("verdict", () =>
      judge(opts.io, opts.models.reasoning, { bundle, extraction, flags, gate: gateVerdict(flags), profile: opts.profile, evSummary: describeEV(ev) }),
    );
    emit({ step: "verdict", status: "done", ms: t.verdict, detail: `Model says ${model.verdict.toLowerCase()}` });
  } catch (err) {
    console.warn("verdict model failed, using rule verdict:", (err as Error).message);
    emit({ step: "verdict", status: "skipped", ms: t.verdict, detail: "Model unavailable — rules-only verdict" });
  }

  // Model-proposed flags survive only if their quote is really on the page.
  const modelFlags: RedFlag[] = (model?.additionalFlags ?? [])
    .filter((f) => isVerbatim(f.quote, bundle.text))
    .filter((f) => !flags.some((r) => r.evidence.some((e) => isVerbatim(f.quote, e.quote))))
    .map((f, i) => ({ id: `model-${i}`, label: f.label, severity: "low", explanation: f.explanation, evidence: [{ quote: f.quote, source: "page" }] }));
  const allFlags = [...flags, ...modelFlags];

  const gate = gateVerdict(allFlags);
  // The model may only be stricter than the rules when it proves a rubric criterion with a quote on the page.
  let verdict = gate;
  let escalation: AnalysisResult["escalation"] = null;
  if (model && stricter(gate, model.verdict) !== gate) {
    const proven = !!model.escalation && criterionAllows(model.escalation.criterion, model.verdict) &&
      escalationProven(model.escalation, { text: bundle.text, flags: allFlags, sponsorVerified: bundle.facts.sponsorVerified, rules: opts.rules ?? DEFAULT_RULES });
    escalation = { to: model.verdict, criterion: model.escalation?.criterion ?? null, quote: model.escalation?.quote ?? null, accepted: proven };
    if (proven) verdict = model.verdict;
  }

  const regionFlag = allFlags.find((f) => f.id === "region-mismatch");
  const eligibility: Eligibility = {
    eligible: regionFlag ? false : (model?.eligible ?? null),
    region: bundle.facts.region ?? extraction?.regionRestriction ?? null,
    online: bundle.facts.online ?? extraction?.online ?? null,
    preconditions: extraction?.preconditions ?? [],
    notes: extraction?.eligibilityNotes ?? [],
  };

  return {
    url: bundle.url,
    platform: bundle.platform,
    title: bundle.facts.title ?? extraction?.title ?? bundle.url,
    sponsor: bundle.facts.sponsorName ?? extraction?.sponsor ?? null,
    verdict,
    gateVerdict: gate,
    modelVerdict: model?.verdict ?? null,
    escalation,
    // A rejected escalation means the model's text argues for a verdict we did not accept: don't show it.
    summary: model && !(escalation && !escalation.accepted) ? model.summary : FALLBACK_SUMMARY[verdict],
    reasons: model && !(escalation && !escalation.accepted) ? model.reasons : allFlags.filter((f) => f.severity !== "low").map((f) => f.explanation),
    eligibility,
    deadline: toIsoDate(bundle.facts.deadline) ?? toIsoDate(extraction?.deadline),
    prizes: bundle.facts.prizes?.length ? bundle.facts.prizes : (extraction?.prizes ?? []),
    flags: allFlags.sort((a, b) => SEV[a.severity] - SEV[b.severity]),
    ev,
    models: opts.models,
    sources: bundle.fetchedWith,
    timingsMs: t,
    analyzedAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
  };
}

/** Best-effort: "2026-11-14T18:29:59Z", "October 30, 2026", "Aug 26 - Oct 30, 2026" → ISO date. */
export function toIsoDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const direct = Date.parse(text);
  if (!Number.isNaN(direct)) return new Date(direct).toISOString();
  // Ranges keep the end ("Aug 26 - Oct 30, 2026" → "Oct 30, 2026"); trailing prose is ignored.
  const year = text.match(/\b(20\d\d)\b/)?.[1];
  const month = text.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i)?.[0];
  const parts = text.split(/\s[-–—]\s|\bto\b/).map((p) => {
    let part = p.replace(/\s*\(.*\)$/, "").replace(/\bat\b.*$/, "").trim();
    // "Oct 16 - 24, 2026": the end has no month; "Oct 16": no year.
    if (/^\d{1,2}(,|\s|$)/.test(part) && month) part = `${month} ${part}`;
    if (year && !/\b20\d\d\b/.test(part)) part = `${part}, ${year}`;
    return part;
  });
  // V8's Date.parse is lenient ("as scheduled, 2026" → Jan 1), so only try parts that name a month.
  for (const part of parts.reverse().filter((p) => /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(p))) {
    // Date-only text: pin to noon UTC so the calendar day survives any timezone.
    const parsed = Number.isNaN(Date.parse(`${part} 12:00:00 UTC`)) ? Date.parse(part) : Date.parse(`${part} 12:00:00 UTC`);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

/**
 * A verbatim quote is necessary but not sufficient ("Nebius Token Factory" is verbatim and proves no token sale).
 * Each criterion needs evidence of its own kind: a rule pattern match, a platform fact, or a real sentence.
 */
export function escalationProven(
  esc: { criterion: string; quote: string },
  ctx: { text: string; flags: RedFlag[]; sponsorVerified?: boolean | null; rules: RuleSpec[] },
): boolean {
  if (!isVerbatim(esc.quote, ctx.text)) return false;
  const pattern = (id: string) => {
    const p = ctx.rules.find((r) => r.id === id)?.params.pattern;
    return p ? new RegExp(String(p), "i") : null;
  };
  switch (esc.criterion) {
    case "token_promotion":
      return !!pattern("token-promotion")?.test(esc.quote);
    case "engagement_judging":
      return !!pattern("engagement-judging")?.test(esc.quote);
    case "unverified_sponsor":
      return ctx.sponsorVerified === false;
    case "terms_edited":
      return ctx.flags.some((f) => f.id === "listing-changed");
    default:
      // trap_or_bait, unverifiable_or_offplatform_payment, user_ineligible, prize_not_money, unmet_precondition
      return esc.quote.trim().split(/\s+/).length >= 6;
  }
}

const AVOID_CRITERIA = new Set(["trap_or_bait", "unverifiable_or_offplatform_payment", "user_ineligible", "prize_not_money"]);
function criterionAllows(criterion: string, to: Verdict): boolean {
  return to === "AVOID" ? AVOID_CRITERIA.has(criterion) : true;
}

const SEV = { critical: 0, high: 1, medium: 2, low: 3 } as const;

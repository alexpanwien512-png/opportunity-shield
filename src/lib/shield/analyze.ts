// Orchestrates one analysis: fetch → extract (fast Nemotron) → rules → EV → verdict (reasoning Nemotron).
import type { IO } from "./io";
import { fetchSource } from "./sources";
import { extractFacts, judge, type ModelVerdict } from "./llm";
import { DEFAULT_RULES, gateVerdict, isVerbatim, runRules, stricter, type RuleSpec } from "./rules";
import { describeEV, expectedValue } from "./ev";
import type { AnalysisResult, Eligibility, Extraction, Profile, RedFlag, Verdict } from "./types";

export interface AnalyzeOptions {
  io: IO;
  profile: Profile;
  rules?: RuleSpec[];
  blacklist?: string[];
  models: { fast: string; reasoning: string };
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

  const bundle = await time("fetch", () => fetchSource(url, opts.io));

  let extraction: Extraction | null = null;
  try {
    extraction = await time("extract", () => extractFacts(opts.io, opts.models.fast, bundle));
  } catch (err) {
    console.warn("extraction failed, continuing with platform facts only:", (err as Error).message);
  }

  const ctx = { bundle, extraction, profile: opts.profile, blacklist: (opts.blacklist ?? []).map((b) => b.toLowerCase()) };
  const flags = runRules(ctx, opts.rules ?? DEFAULT_RULES);
  const ev = expectedValue(bundle, extraction, flags);

  let model: ModelVerdict | null = null;
  try {
    model = await time("verdict", () =>
      judge(opts.io, opts.models.reasoning, { bundle, extraction, flags, gate: gateVerdict(flags), profile: opts.profile, evSummary: describeEV(ev) }),
    );
  } catch (err) {
    console.warn("verdict model failed, using rule verdict:", (err as Error).message);
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
    const proven = !!model.escalation && isVerbatim(model.escalation.quote, bundle.text) && criterionAllows(model.escalation.criterion, model.verdict);
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
    summary: model?.summary ?? FALLBACK_SUMMARY[verdict],
    reasons: model?.reasons ?? allFlags.map((f) => f.explanation),
    eligibility,
    prizes: bundle.facts.prizes?.length ? bundle.facts.prizes : (extraction?.prizes ?? []),
    flags: allFlags.sort((a, b) => SEV[a.severity] - SEV[b.severity]),
    ev,
    models: opts.models,
    sources: bundle.fetchedWith,
    timingsMs: t,
    analyzedAt: new Date().toISOString(),
  };
}

const AVOID_CRITERIA = new Set(["trap_or_bait", "unverifiable_or_offplatform_payment", "user_ineligible", "prize_not_money"]);
function criterionAllows(criterion: string, to: Verdict): boolean {
  return to === "AVOID" ? AVOID_CRITERIA.has(criterion) : true;
}

const SEV = { critical: 0, high: 1, medium: 2, low: 3 } as const;

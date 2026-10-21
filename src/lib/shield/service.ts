// Server-side entry points: analysis with memory (profile, rules, blacklist, history cache).
import { analyzeUrl, PIPELINE_VERSION } from "./analyze";
import { config } from "./config";
import type { IO } from "./io";
import { liveIO } from "./live";
import { normalizeUrl } from "./sources";
import { store, type Store } from "./store";
import type { AnalysisResult } from "./types";

const CACHE_MS = 6 * 60 * 60 * 1000; // re-use an analysis for 6h to save Tavily/Token Factory credits

export const MODELS = { fast: config.fastModel, reasoning: config.reasoningModel };

export async function analyzeWithMemory(
  rawUrl: string,
  opts: { force?: boolean; io?: IO; db?: Store } = {},
): Promise<AnalysisResult & { cached: boolean }> {
  const db = opts.db ?? store();
  const url = normalizeUrl(rawUrl);
  if (!opts.force) {
    const prev = db.getAnalysis(url);
    if (prev && prev.pipelineVersion === PIPELINE_VERSION && Date.now() - Date.parse(prev.analyzedAt) < CACHE_MS) return { ...prev, cached: true };
  }
  const result = await analyzeUrl(url, {
    io: opts.io ?? liveIO,
    profile: db.getProfile(),
    rules: db.getRules(),
    blacklist: db.blacklistValues(),
    models: MODELS,
  });
  db.saveAnalysis(result);
  return { ...result, cached: false };
}

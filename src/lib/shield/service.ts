// Server-side entry points: analysis with memory (profile, rules, blacklist, history, cache).
import { analyzeUrl, PIPELINE_VERSION } from "./analyze";
import { config } from "./config";
import type { IO } from "./io";
import { liveIO } from "./live";
import { normalizeUrl } from "./sources";
import { inputsKey, store, type Store } from "./store";
import type { AnalysisResult } from "./types";

const CACHE_MS = 6 * 60 * 60 * 1000; // re-use an analysis for 6h to save Tavily/Token Factory credits

export const MODELS = { fast: config.fastModel, reasoning: config.reasoningModel };

export async function analyzeWithMemory(
  owner: string,
  rawUrl: string,
  opts: { force?: boolean; io?: IO; db?: Store; beforeLiveRun?: () => Promise<void> } = {},
): Promise<AnalysisResult & { cached: boolean }> {
  const db = opts.db ?? store();
  const url = normalizeUrl(rawUrl);
  const inputs = { profile: db.getProfile(owner), rules: db.getRules(owner), blacklist: db.blacklistValues(owner) };
  const key = inputsKey(url, { ...inputs, pipelineVersion: PIPELINE_VERSION });
  if (!opts.force) {
    const prev = db.cachedAnalysis(key);
    if (prev && Date.now() - Date.parse(prev.analyzedAt) < CACHE_MS) {
      db.recordHistory(owner, key, prev);
      return { ...prev, cached: true };
    }
  }
  await opts.beforeLiveRun?.(); // e.g. the demo rate limit: cache hits stay free
  const result = await analyzeUrl(url, { io: opts.io ?? liveIO, ...inputs, models: MODELS });
  db.saveAnalysis(key, result);
  db.recordHistory(owner, key, result);
  return { ...result, cached: false };
}

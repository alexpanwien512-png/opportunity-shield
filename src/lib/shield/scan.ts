// Scan: Tavily Search discovers fresh listings → Nemotron (fast) triages them against the
// profile → the full analysis pipeline runs on the survivors → NOW / NEXT / PARK.
import { z } from "zod";
import type { IO } from "./io";
import { regionIncludes } from "./rules";
import { normalizeUrl } from "./sources";
import type { AnalysisResult, Profile, SearchHit, Verdict } from "./types";

export type Bucket = "NOW" | "NEXT" | "PARK";

export interface Candidate {
  url: string;
  title: string;
  snippet: string;
  source: string; // "tavily:search" | "devpost:api" | "superteam:api"
  deadline?: string | null;
  region?: string | null;
  prize?: string | null;
}

export interface ScanItem {
  url: string;
  title: string;
  platform: string;
  sponsor: string | null;
  verdict: Verdict;
  bucket: Bucket;
  why: string;
  deadline: string | null;
  evPerHourUsd: number | null;
  bestPrizeUsd: number | null;
  topFlag: string | null;
  cached: boolean;
}

export type ScanEvent =
  | { type: "searching"; queries: string[] }
  | { type: "discovered"; candidates: Candidate[] }
  | { type: "triaged"; kept: { url: string; reason: string }[]; dropped: { url: string; reason: string }[] }
  | { type: "analyzing"; url: string }
  | { type: "result"; item: ScanItem }
  | { type: "failed"; url: string; error: string }
  | { type: "done"; items: ScanItem[] };

// ---------- discovery: Tavily Search + platform feeds ----------

export function scanQueries(profile: Profile): { query: string; domains: string[] }[] {
  const skills = profile.skills.slice(0, 3).join(" ");
  return [
    { query: `Superteam Earn open bounty ${skills}`, domains: ["superteam.fun"] },
    // Phrasing matters: "open for submissions" surfaces project pages (devpost.com/software/*), not hackathons.
    { query: `devpost hackathon online ${new Date().getFullYear()} prizes ${skills}`, domains: ["devpost.com"] },
  ];
}

/** Keeps only listing pages: Superteam listings and Devpost hackathon sites. */
export function listingUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.hostname.endsWith("superteam.fun")) {
    const m = url.pathname.match(/^\/earn\/listing\/([^/]+)/);
    return m ? `https://superteam.fun/earn/listing/${m[1]}` : null;
  }
  // Hackathon microsites are <slug>.devpost.com; devpost.com/software/* are project pages.
  if (url.hostname.endsWith(".devpost.com") && !/^(www|help|info|secure)\./.test(url.hostname)) return `https://${url.hostname}`;
  return null;
}

interface DevpostOpen {
  title: string; url: string; open_state: string; invite_only: boolean; time_left_to_submission: string;
  displayed_location: { location: string }; prize_amount: string;
}
interface SuperteamOpen {
  slug: string; title: string; status: string; deadline: string; rewardAmount: number; token: string; isWinnersAnnounced: boolean;
}
interface SuperteamDetails { region: string; status: string; deadline: string; skills?: { skills: string; subskills: string[] }[] }

async function feeds(io: IO): Promise<Candidate[]> {
  const out: Candidate[] = [];
  try {
    const dp = (await io.httpJson("https://devpost.com/api/hackathons?status[]=open&challenge_type[]=online&order_by=prize-amount&per_page=12")) as { hackathons: DevpostOpen[] };
    for (const h of dp.hackathons) {
      if (h.invite_only || h.open_state !== "open") continue;
      out.push({
        url: normalizeUrl(h.url), title: h.title, source: "devpost:api", region: h.displayed_location.location,
        prize: h.prize_amount.replace(/<[^>]+>/g, ""), snippet: `${h.displayed_location.location}; ${h.time_left_to_submission}`,
      });
    }
  } catch (err) {
    console.warn("devpost feed failed", err);
  }
  try {
    const st = (await io.httpJson("https://superteam.fun/api/listings?type=bounty&take=20")) as SuperteamOpen[];
    for (const l of st) {
      if (l.status !== "OPEN" || l.isWinnersAnnounced) continue;
      out.push({
        url: `https://superteam.fun/earn/listing/${l.slug}`, title: l.title, source: "superteam:api", deadline: l.deadline,
        prize: `${l.rewardAmount} ${l.token}`, snippet: "",
      });
    }
  } catch (err) {
    console.warn("superteam feed failed", err);
  }
  return out;
}

export async function discover(io: IO, profile: Profile, blacklist: string[]): Promise<{ candidates: Candidate[] }> {
  const qs = scanQueries(profile);
  const [searches, feed] = await Promise.all([
    Promise.all(qs.map((q) => io.tavilySearch(q.query, { includeDomains: q.domains, timeRange: "month", maxResults: 10 }).catch(() => [] as SearchHit[]))),
    feeds(io),
  ]);
  const seen = new Map<string, Candidate>();
  for (const hits of searches) {
    for (const h of hits) {
      const url = listingUrl(h.url);
      if (url && !seen.has(normalizeUrl(url))) seen.set(normalizeUrl(url), { url: normalizeUrl(url), title: h.title, snippet: h.content.slice(0, 400), source: "tavily:search" });
    }
  }
  for (const c of feed) {
    const prev = seen.get(c.url);
    seen.set(c.url, prev ? { ...c, snippet: prev.snippet || c.snippet, source: `${prev.source}+${c.source}` } : c);
  }
  const candidates = [...seen.values()].filter((c) => {
    const host = new URL(c.url).hostname;
    return !blacklist.some((b) => b === host || c.url.toLowerCase().includes(b));
  });
  return { candidates };
}

// ---------- deterministic prefilter (platform facts, no LLM) ----------

export async function prefilter(io: IO, profile: Profile, candidates: Candidate[], now = Date.now()) {
  const kept: Candidate[] = [];
  const dropped: { url: string; reason: string }[] = [];
  await Promise.all(
    candidates.map(async (c) => {
      let { region, deadline } = c;
      if (c.url.includes("superteam.fun/earn/listing/")) {
        try {
          const d = (await io.httpJson(`https://superteam.fun/api/listings/details/${c.url.split("/").pop()}`)) as SuperteamDetails;
          if (d.status !== "OPEN") return dropped.push({ url: c.url, reason: `Status ${d.status}` });
          region = d.region;
          deadline = d.deadline;
          c.snippet ||= (d.skills ?? []).map((s) => [s.skills, ...s.subskills].join("/")).join(", ");
        } catch {
          /* keep: the full analysis will try again */
        }
      }
      if (deadline && Date.parse(deadline) < now) return dropped.push({ url: c.url, reason: "Deadline has passed" });
      if (region && !regionIncludes(region, profile.residenceCountry)) {
        return dropped.push({ url: c.url, reason: `Restricted to ${region}` });
      }
      kept.push({ ...c, region, deadline });
    }),
  );
  return { kept, dropped };
}

// ---------- triage (Nemotron fast) ----------

export const TRIAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["decisions"],
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["url", "keep", "reason"],
        properties: { url: { type: "string" }, keep: { type: "boolean" }, reason: { type: "string" } },
      },
    },
  },
} as const;

const TriageZ = z.object({ decisions: z.array(z.object({ url: z.string(), keep: z.boolean(), reason: z.string() })) });

export async function triage(io: IO, model: string, profile: Profile, candidates: Candidate[], limit: number) {
  if (!candidates.length) return { kept: [], dropped: [] };
  const raw = await io.llmJson({
    model,
    schemaName: "triage",
    schema: TRIAGE_SCHEMA as unknown as Record<string, unknown>,
    messages: [
      {
        role: "system",
        content:
          "You rank open opportunities (already checked: open, not expired, not region-locked) for one person before a costly deep analysis. " +
          "Set keep=false only when the task clearly does not fit the person's skills (e.g. a video-editing job for a backend developer). When unsure, keep. " +
          "List the decisions with the best fits first. Give a one-line reason for each. " +
          `Respond with JSON matching this schema: ${JSON.stringify(TRIAGE_SCHEMA)}`,
      },
      {
        role: "user",
        content: `PROFILE: ${JSON.stringify({ skills: profile.skills, audience: profile.audience })}\n\nCANDIDATES:\n${candidates
          .map((c) => `- ${c.url}\n  title: ${c.title}\n  prize: ${c.prize ?? "?"}\n  details: ${c.snippet.replace(/\s+/g, " ")}`)
          .join("\n")}`,
      },
    ],
  });
  const decisions = TriageZ.parse(raw).decisions;
  const byUrl = new Map(decisions.map((d) => [normalizeUrl(d.url), d]));
  const rank = new Map(decisions.map((d, i) => [normalizeUrl(d.url), i]));
  const kept: { url: string; reason: string }[] = [];
  const dropped: { url: string; reason: string }[] = [];
  for (const c of [...candidates].sort((a, b) => (rank.get(a.url) ?? 999) - (rank.get(b.url) ?? 999))) {
    const d = byUrl.get(c.url);
    // Unknown to the model → keep it; triage is a filter, not a judge.
    if (!d || d.keep) kept.push({ url: c.url, reason: d?.reason ?? "not triaged" });
    else dropped.push({ url: c.url, reason: d.reason });
  }
  return { kept: kept.slice(0, limit), dropped: [...dropped, ...kept.slice(limit).map((k) => ({ url: k.url, reason: `over the scan limit of ${limit}` }))] };
}

// ---------- buckets ----------

const DAY = 86_400_000;

/** NOW: apply and the deadline is close. NEXT: worth doing, not urgent. PARK: avoid, closed, or not worth the hours. */
export function bucketFor(r: AnalysisResult, profile: Profile, now = Date.now()): { bucket: Bucket; why: string } {
  const daysLeft = r.deadline ? (Date.parse(r.deadline) - now) / DAY : null;
  if (daysLeft != null && daysLeft < 0) return { bucket: "PARK", why: "Deadline has passed" };
  if (r.verdict === "AVOID") return { bucket: "PARK", why: r.flags[0]?.label ?? "Avoid" };
  const days = daysLeft != null ? `${Math.max(0, Math.ceil(daysLeft))}d left` : "no deadline found";
  if (r.verdict === "APPLY") {
    return daysLeft != null && daysLeft <= 21 ? { bucket: "NOW", why: `Apply · ${days}` } : { bucket: "NEXT", why: `Apply · ${days}` };
  }
  // CAUTION: only worth a slot if the expected value is a meaningful share of the user's rate.
  const floor = profile.hourlyRateUsd * 0.25;
  if (r.ev.evPerHourUsd != null && r.ev.evPerHourUsd >= floor) return { bucket: "NEXT", why: `Caution, but ~$${r.ev.evPerHourUsd.toFixed(0)}/h · ${days}` };
  return { bucket: "PARK", why: `Caution and ~$${(r.ev.evPerHourUsd ?? 0).toFixed(1)}/h (< $${floor.toFixed(0)}/h)` };
}

export function toScanItem(r: AnalysisResult & { cached?: boolean }, profile: Profile, now = Date.now()): ScanItem {
  const { bucket, why } = bucketFor(r, profile, now);
  return {
    url: r.url,
    title: r.title,
    platform: r.platform,
    sponsor: r.sponsor,
    verdict: r.verdict,
    bucket,
    why,
    deadline: r.deadline,
    evPerHourUsd: r.ev.evPerHourUsd,
    bestPrizeUsd: r.ev.bestPrizeUsd,
    topFlag: r.flags.find((f) => f.severity !== "low")?.label ?? null,
    cached: !!r.cached,
  };
}

const ORDER: Record<Bucket, number> = { NOW: 0, NEXT: 1, PARK: 2 };
export function sortItems(items: ScanItem[]): ScanItem[] {
  return [...items].sort(
    (a, b) => ORDER[a.bucket] - ORDER[b.bucket] || (Date.parse(a.deadline ?? "9999") - Date.parse(b.deadline ?? "9999")) || (b.evPerHourUsd ?? 0) - (a.evPerHourUsd ?? 0),
  );
}

// ---------- orchestration ----------

export interface ScanDeps {
  io: IO;
  profile: Profile;
  blacklist: string[];
  fastModel: string;
  analyze: (url: string) => Promise<AnalysisResult & { cached?: boolean }>;
  limit?: number;
  concurrency?: number;
}

export async function* scan(deps: ScanDeps): AsyncGenerator<ScanEvent> {
  yield { type: "searching", queries: scanQueries(deps.profile).map((q) => q.query) };
  const { candidates } = await discover(deps.io, deps.profile, deps.blacklist);
  yield { type: "discovered", candidates };

  const pre = await prefilter(deps.io, deps.profile, candidates);
  let kept: { url: string; reason: string }[];
  let dropped: { url: string; reason: string }[] = [];
  try {
    ({ kept, dropped } = await triage(deps.io, deps.fastModel, deps.profile, pre.kept, deps.limit ?? 6));
  } catch {
    kept = pre.kept.slice(0, deps.limit ?? 6).map((c) => ({ url: c.url, reason: "triage unavailable" }));
  }
  yield { type: "triaged", kept, dropped: [...pre.dropped, ...dropped] };

  // Bounded concurrency; results stream out as each analysis finishes.
  const queue = kept.map((k) => k.url);
  const items: ScanItem[] = [];
  const events: ScanEvent[] = [];
  let wake: (() => void) | null = null;
  const push = (e: ScanEvent) => {
    events.push(e);
    wake?.();
  };
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      push({ type: "analyzing", url });
      try {
        const item = toScanItem(await deps.analyze(url), deps.profile);
        items.push(item);
        push({ type: "result", item });
      } catch (err) {
        push({ type: "failed", url, error: (err as Error).message });
      }
    }
  };
  let running = true;
  Promise.all(Array.from({ length: deps.concurrency ?? 2 }, worker)).then(() => {
    running = false;
    wake?.();
  });
  while (running || events.length) {
    if (!events.length) await new Promise<void>((r) => (wake = r));
    wake = null;
    while (events.length) yield events.shift()!;
  }
  yield { type: "done", items: sortItems(items) };
}

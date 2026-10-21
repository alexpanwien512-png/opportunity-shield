// Fetches a listing: Tavily Extract for the page text (what evidence is quoted
// from) plus platform JSON APIs for hard facts (counts, region, sponsor status).
import type { IO } from "./io";
import type { Platform, PlatformFacts, Prize, SearchHit, SourceBundle } from "./types";

export function detectPlatform(url: string): Platform {
  const host = new URL(url).hostname;
  if (host === "github.com") return "github";
  if (host.endsWith("superteam.fun")) return "superteam";
  if (host.endsWith("devpost.com")) return "devpost";
  return "web";
}

export function normalizeUrl(input: string): string {
  const url = new URL(input.trim().startsWith("http") ? input.trim() : `https://${input.trim()}`);
  url.hash = "";
  url.search = "";
  if (url.hostname === "www.github.com") url.hostname = "github.com";
  return url.toString().replace(/\/$/, "");
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(br|\/p|\/h\d|\/li|\/div)[^>]*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

const STABLECOINS = new Set(["USDC", "USDT", "USDG", "PYUSD", "DAI"]);

// ---------- GitHub ----------

const BOUNTY_BOTS = /algora|opire|bountyhub|gitpay|polar/i;

async function githubFacts(url: string, io: IO): Promise<{ facts: PlatformFacts; text: string }> {
  const m = new URL(url).pathname.match(/^\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);
  if (!m) throw new Error("Unsupported GitHub URL — paste an issue link");
  const [, owner, repo, , num] = m;
  const api = `https://api.github.com/repos/${owner}/${repo}`;
  const issue = (await io.httpJson(`${api}/issues/${num}`)) as {
    title: string; body: string | null; comments: number; created_at: string; user: { login: string };
  };
  const repoInfo = (await io.httpJson(api)) as {
    created_at: string; stargazers_count: number; open_issues_count: number; language: string | null;
  };
  // Sample the first page of comments; enough to count /attempt claims and bounty bots.
  const comments = (await io.httpJson(`${api}/issues/${num}/comments?per_page=100`)) as {
    body: string | null; user: { login: string; type: string };
  }[];
  const prSearch = (await io.httpJson(
    `https://api.github.com/search/issues?q=repo:${owner}/${repo}+is:pr&per_page=1`,
  )) as { total_count?: number };

  const body = issue.body ?? "";
  const attemptCount = comments.filter((c) => /(^|\s)\/attempt\b/.test(c.body ?? "")).length;
  const hasBountyCommand = /\/bounty\s+\$?\d/.test(body);
  const botConfirmed = comments.some((c) => BOUNTY_BOTS.test(c.user.login) || BOUNTY_BOTS.test(c.body ?? ""));
  const amount = body.match(/\$\s?([\d,]+)/);

  const facts: PlatformFacts = {
    platform: "github",
    title: issue.title,
    sponsorName: owner,
    sponsorUrl: `https://github.com/${owner}`,
    sponsorVerified: null,
    region: "Global",
    online: true,
    repo: `${owner}/${repo}`,
    repoCreatedAt: repoInfo.created_at,
    repoStars: repoInfo.stargazers_count,
    repoOpenIssues: repoInfo.open_issues_count,
    repoPullRequests: prSearch.total_count ?? null,
    repoLanguage: repoInfo.language,
    issueCommentCount: issue.comments,
    attemptCount,
    attemptSampleSize: comments.length,
    bountyOnlyInComment: hasBountyCommand && !botConfirmed,
    prizes: amount ? [{ place: "1", amount: Number(amount[1].replace(/,/g, "")), currency: "USD", kind: "cash" }] : [],
    prizeCount: amount ? 1 : null,
    // Everyone who commented is a potential competitor for a single bounty.
    submissionCount: Math.max(attemptCount, 0) || null,
  };
  const commentText = comments
    .slice(0, 30)
    .map((c) => `[comment by ${c.user.login}] ${(c.body ?? "").slice(0, 600)}`)
    .join("\n");
  return { facts, text: `# ${issue.title}\n\n${body}\n\n${commentText}` };
}

// ---------- Superteam Earn ----------

interface SuperteamListing {
  id: string; title: string; description: string; deadline: string; region: string; token: string;
  rewardAmount: number; rewards: Record<string, number>; maxBonusSpots: number; type: string;
  eligibility: { question: string }[] | null; pocSocials: string | null;
  sponsor: { name: string; url: string; isVerified: boolean; isCaution: boolean };
}

async function superteamFacts(url: string, io: IO): Promise<{ facts: PlatformFacts; text: string }> {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
  const listing = (await io.httpJson(`https://superteam.fun/api/listings/details/${slug}`)) as SuperteamListing;
  const count = await io.httpJson(`https://superteam.fun/api/listings/${listing.id}/submission-count`);

  const kind: Prize["kind"] = STABLECOINS.has(listing.token) ? "crypto" : "other";
  const prizes: Prize[] = [];
  let prizeCount = 0;
  for (const [place, amount] of Object.entries(listing.rewards ?? {})) {
    if (place === "99") {
      if (listing.maxBonusSpots > 0) {
        prizes.push({ place: `bonus x${listing.maxBonusSpots}`, amount, currency: listing.token, kind });
        prizeCount += listing.maxBonusSpots;
      }
    } else {
      prizes.push({ place, amount, currency: listing.token, kind });
      prizeCount += 1;
    }
  }
  const facts: PlatformFacts = {
    platform: "superteam",
    title: listing.title,
    sponsorName: listing.sponsor.name,
    sponsorUrl: listing.sponsor.url,
    sponsorVerified: listing.sponsor.isVerified && !listing.sponsor.isCaution,
    region: listing.region,
    online: true,
    deadline: listing.deadline,
    prizes,
    prizeCount,
    totalPrizeUsd: listing.rewardAmount,
    submissionCount: typeof count === "number" ? count : Number(count) || null,
    raw: { pocSocials: listing.pocSocials, type: listing.type },
  };
  const questions = (listing.eligibility ?? []).map((e) => `- ${e.question}`).join("\n");
  const text = `# ${listing.title}\n\nSponsor: ${listing.sponsor.name}\nRegion: ${listing.region}\n\n${htmlToText(
    listing.description,
  )}\n\nSubmission questions:\n${questions}`;
  return { facts, text };
}

// ---------- Devpost ----------

interface DevpostHackathon {
  title: string; url: string; displayed_location: { location: string }; prize_amount: string;
  prizes_counts: { cash: number; other: number }; registrations_count: number;
  organization_name: string; managed_by_devpost_badge: boolean; submission_period_dates: string;
  invite_only: boolean;
}

async function devpostFacts(url: string, title: string | null, rules: string | null, io: IO): Promise<{ facts: PlatformFacts; text: string }> {
  const facts: PlatformFacts = { platform: "devpost", online: null };
  if (!title) return { facts, text: "" };
  const res = (await io.httpJson(
    `https://devpost.com/api/hackathons?search=${encodeURIComponent(title)}`,
  )) as { hackathons: DevpostHackathon[] };
  const host = new URL(url).hostname;
  const h = res.hackathons.find((x) => new URL(x.url, "https://devpost.com").hostname === host);
  if (!h) return { facts, text: "" };
  let prizeText = "";
  const total = Number(htmlToText(h.prize_amount).replace(/[^\d.]/g, "")) || null;
  Object.assign(facts, {
    title: h.title,
    sponsorName: h.organization_name,
    sponsorVerified: h.managed_by_devpost_badge ? true : null,
    online: /online/i.test(h.displayed_location.location),
    region: /online/i.test(h.displayed_location.location) ? "Global" : h.displayed_location.location,
    totalPrizeUsd: total,
    prizeCount: h.prizes_counts.cash + h.prizes_counts.other,
    registrationCount: h.registrations_count,
    submissionCount: null,
    deadline: h.submission_period_dates,
    raw: { prizes_counts: h.prizes_counts, invite_only: h.invite_only, period: h.submission_period_dates },
  } satisfies Partial<PlatformFacts>);
  const table = rules ? parseDevpostPrizeTable(rules) : null;
  if (table?.prizes.length) {
    facts.prizes = table.prizes;
    facts.prizeCount = table.winners;
    prizeText = `\nPrizes (official rules):\n${table.text}`;
  }
  const text = `Devpost listing: ${h.title} — ${h.displayed_location.location}; total prizes ${htmlToText(
    h.prize_amount,
  )}; ${h.prizes_counts.cash} cash prizes and ${h.prizes_counts.other} other prizes; ${h.registrations_count} participants registered.${prizeText}`;
  return { facts, text };
}

/**
 * Devpost prize table from the official rules page ("| Grand Prize | * $20,000 USD | 1 | ... |").
 * The main page's prize cards lose their amounts in Tavily Extract; the rules table keeps them.
 */
export function parseDevpostPrizeTable(rules: string): { prizes: Prize[]; winners: number; text: string } {
  const prizes: Prize[] = [];
  const lines: string[] = [];
  let winners = 0;
  for (const row of rules.split("\n")) {
    const cells = row.split("|").map((c) => c.replace(/^\s*\*\s*/, "").trim());
    // ["", name, items, quantity, eligibility, ""]
    if (cells.length < 5 || !/^\d+$/.test(cells[3])) continue;
    const [, name, items, qty] = cells;
    const count = Number(qty);
    const amount = items.match(/\$\s*([\d,]+)/);
    const kind: Prize["kind"] = amount ? "cash" : /credit/i.test(items) ? "credits" : "other";
    prizes.push({ place: count > 1 ? `${name} (x${count})` : name, amount: amount ? Number(amount[1].replace(/,/g, "")) : null, currency: amount ? "USD" : null, kind });
    winners += count;
    lines.push(`- ${name}: ${items} (${count} winner${count > 1 ? "s" : ""})`);
  }
  return { prizes, winners, text: lines.join("\n") };
}

function firstHeading(markdown: string | null): string | null {
  const m = markdown?.match(/^#\s+(.+)$/m);
  // Headings can be markdown links: "[Title](https://...)" or "Title(https://...)".
  return m ? m[1].replace(/\(https?:[^)]*\)/g, "").replace(/[*_[\]]/g, "").trim() : null;
}

// ---------- Sponsor research (Tavily Search) ----------

export function sponsorQuery(name: string): string {
  return `"${name}" scam OR presale OR token launch OR complaints`;
}

async function researchSponsor(facts: PlatformFacts, io: IO): Promise<SearchHit[]> {
  if (!facts.sponsorName || facts.sponsorVerified === true) return [];
  try {
    return await io.tavilySearch(sponsorQuery(facts.sponsorName), { maxResults: 5 });
  } catch (err) {
    console.warn("sponsor research failed", err);
    return [];
  }
}

// ---------- Live listing vs. indexed snapshot ----------

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9$]+/g, " ").trim();

/** Sponsors sometimes edit a listing after it is indexed (title, prize pool). That edit is itself a signal. */
export function compareSnapshot(facts: PlatformFacts, page: string): PlatformFacts["snapshotChanges"] {
  const changes: NonNullable<PlatformFacts["snapshotChanges"]> = [];
  const heading = page.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (facts.title && heading && squash(heading) !== squash(facts.title)) {
    changes.push({ field: "title", live: facts.title, snapshot: heading });
  }
  const total = page.match(/([\d,]+(?:\.\d+)?)\s*(USDC|USDG|USDT|USD)\s*Total Prizes/i);
  if (total && facts.totalPrizeUsd != null) {
    const snap = Number(total[1].replace(/,/g, ""));
    if (Math.abs(snap - facts.totalPrizeUsd) > 1) {
      changes.push({ field: "total prizes", live: `${facts.totalPrizeUsd}`, snapshot: `${snap}` });
    }
  }
  return changes;
}

// ---------- Entry point ----------

export async function fetchSource(rawUrl: string, io: IO): Promise<SourceBundle> {
  const url = normalizeUrl(rawUrl);
  const platform = detectPlatform(url);
  const fetchedWith: string[] = [];

  let page: string | null = null;
  try {
    page = await io.tavilyExtract(url);
    if (page) fetchedWith.push("tavily:extract");
  } catch (err) {
    console.warn("tavily extract failed", err);
  }

  let api: { facts: PlatformFacts; text: string } = { facts: { platform }, text: "" };
  if (platform === "github") {
    try {
      api = await githubFacts(url, io);
    } catch (err) {
      // Unauthenticated GitHub API calls share a 60/h limit per IP (exhausted fast on shared hosts).
      // Without it we lose repo-level signals (age, PR volume, /attempt count) but the page rules still run.
      if (!page || /Unsupported GitHub URL/.test((err as Error).message)) throw err;
      console.warn("github api unavailable, using page text only:", (err as Error).message);
      api = { facts: { platform, title: firstHeading(page) ?? undefined, region: "Global", online: true }, text: "" };
      fetchedWith.push("github:api-unavailable");
    }
  }
  if (platform === "superteam") api = await superteamFacts(url, io);
  if (platform === "devpost") {
    let rules: string | null = null;
    try {
      rules = await io.tavilyExtract(`${url}/rules`);
    } catch {}
    if (rules) page = `${page ?? ""}\n\n# Official rules\n\n${rules}`;
    api = await devpostFacts(url, firstHeading(page), rules, io);
  }
  if (api.text) fetchedWith.push(`${platform}:api`);
  if (page && platform === "superteam") api.facts.snapshotChanges = compareSnapshot(api.facts, page);
  if (!page && !api.text) throw new Error(`Could not read ${url}`);

  const sponsorResearch = await researchSponsor(api.facts, io);
  if (sponsorResearch.length) fetchedWith.push("tavily:search");

  return {
    url,
    platform,
    text: [api.text && `## Live listing (platform API)\n\n${api.text}`, page && `## Page snapshot (Tavily Extract)\n\n${page}`]
      .filter(Boolean)
      .join("\n\n---\n\n"),
    facts: api.facts,
    sponsorResearch,
    fetchedWith,
  };
}

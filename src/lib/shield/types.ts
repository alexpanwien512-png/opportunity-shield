// Core domain types for the Opportunity Shield pipeline.

export type Verdict = "APPLY" | "CAUTION" | "AVOID";
export type Severity = "critical" | "high" | "medium" | "low";
export type Platform = "github" | "superteam" | "devpost" | "web";

export interface Profile {
  residenceCountry: string; // e.g. "Austria"
  citizenship: string[]; // e.g. ["Romania"]
  skills: string[]; // e.g. ["typescript", "python", "ml"]
  payoutPreferences: string[]; // e.g. ["fiat", "usdc"]
  audience: { platform: string; followers: number }[];
  hourlyRateUsd: number; // opportunity cost used for EV/hour
}

/** A verbatim piece of evidence tied to where it came from. */
export interface Evidence {
  quote: string;
  source: string; // "page" | "github:issue" | "superteam:api" | a URL from Tavily search ...
}

export interface Prize {
  place: string; // "1", "2", "bonus", "per winner" ...
  amount: number | null;
  currency: string | null; // "USD", "USDC", ...
  kind: "cash" | "crypto" | "credits" | "services" | "discount" | "merch" | "other";
}

/** Facts read from platform APIs — deterministic and trusted more than the LLM. */
export interface PlatformFacts {
  platform: Platform;
  title?: string;
  sponsorName?: string;
  sponsorUrl?: string;
  sponsorVerified?: boolean | null;
  region?: string | null; // "Global", "Germany", ...
  online?: boolean | null;
  deadline?: string | null;
  prizes?: Prize[];
  prizeCount?: number | null;
  totalPrizeUsd?: number | null;
  submissionCount?: number | null;
  registrationCount?: number | null;
  // GitHub-specific
  repo?: string;
  repoCreatedAt?: string;
  repoStars?: number;
  repoOpenIssues?: number;
  repoPullRequests?: number | null;
  repoLanguage?: string | null;
  issueCommentCount?: number;
  attemptCount?: number; // "/attempt" comments seen in sampled pages
  attemptSampleSize?: number;
  bountyOnlyInComment?: boolean;
  raw?: Record<string, unknown>;
}

/** Structured extraction produced by the fast Nemotron model. */
export interface Extraction {
  title: string;
  sponsor: string | null;
  taskSummary: string;
  taskCategory: "code" | "security" | "design" | "content" | "social" | "research" | "other";
  online: boolean | null;
  regionRestriction: string | null; // null = global
  eligibilityNotes: string[];
  preconditions: string[]; // "must have participated in X", "existing project"
  prizes: Prize[];
  paymentMethod: string | null;
  judging: string[];
  deadline: string | null;
  estimatedHours: number | null;
  quotes: Record<string, string>; // fact name -> verbatim quote from the page
}

export interface SourceBundle {
  url: string;
  platform: Platform;
  text: string; // cleaned page text the evidence must be found in
  facts: PlatformFacts;
  sponsorResearch: SearchHit[]; // Tavily search results about the sponsor
  fetchedWith: string[]; // e.g. ["tavily:extract", "github:api"]
}

export interface SearchHit {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface RedFlag {
  id: string;
  label: string;
  severity: Severity;
  explanation: string;
  evidence: Evidence[];
}

export interface ExpectedValue {
  bestPrizeUsd: number | null;
  meanPrizeUsd: number | null;
  prizeCount: number | null;
  competitors: number | null; // submissions (or estimated from registrations)
  competitorsEstimated: boolean;
  winProbability: number | null;
  estimatedHours: number;
  evUsd: number | null;
  evPerHourUsd: number | null;
}

export interface Eligibility {
  eligible: boolean | null; // null = unknown
  region: string | null;
  online: boolean | null;
  preconditions: string[];
  notes: string[];
}

export interface AnalysisResult {
  url: string;
  platform: Platform;
  title: string;
  sponsor: string | null;
  verdict: Verdict;
  gateVerdict: Verdict; // ceiling imposed by deterministic rules
  modelVerdict: Verdict | null;
  summary: string;
  reasons: string[];
  eligibility: Eligibility;
  prizes: Prize[];
  flags: RedFlag[];
  ev: ExpectedValue;
  models: { fast: string; reasoning: string };
  sources: string[];
  timingsMs: Record<string, number>;
  analyzedAt: string;
}

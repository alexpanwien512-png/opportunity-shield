// The two Nemotron calls: fast structured extraction, and the final reasoning verdict.
import { z } from "zod";
import type { IO } from "./io";
import type { Extraction, Profile, RedFlag, SourceBundle, Verdict } from "./types";

const MAX_PAGE_CHARS = 24_000;

const nullableString = { type: ["string", "null"] };

export const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "sponsor", "taskSummary", "taskCategory", "online", "regionRestriction", "eligibilityNotes", "preconditions", "prizes", "paymentMethod", "judging", "deadline", "estimatedHours", "quotes"],
  properties: {
    title: { type: "string" },
    sponsor: nullableString,
    taskSummary: { type: "string", description: "One sentence: what you must actually do." },
    taskCategory: { type: "string", enum: ["code", "security", "design", "content", "social", "research", "other"] },
    online: { type: ["boolean", "null"] },
    regionRestriction: { ...nullableString, description: "Country/region participants must be in; null if global." },
    eligibilityNotes: { type: "array", items: { type: "string" } },
    preconditions: { type: "array", items: { type: "string" }, description: "Things you must already have (existing project, prior hackathon entry, audience...)." },
    prizes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["place", "amount", "currency", "kind"],
        properties: {
          place: { type: "string" },
          amount: { type: ["number", "null"] },
          currency: nullableString,
          kind: { type: "string", enum: ["cash", "crypto", "credits", "services", "discount", "merch", "other"] },
        },
      },
    },
    paymentMethod: nullableString,
    judging: { type: "array", items: { type: "string" } },
    deadline: nullableString,
    estimatedHours: { type: ["number", "null"], description: "Realistic hours of work for a competitive entry." },
    quotes: {
      type: "array",
      description: "Verbatim sentences copied from the page that support the facts above.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fact", "quote"],
        properties: {
          fact: { type: "string", enum: ["prizes", "regionRestriction", "preconditions", "paymentMethod", "judging", "deadline", "eligibility"] },
          quote: { type: "string" },
        },
      },
    },
  },
} as const;

const ExtractionZ = z.object({
  title: z.string(),
  sponsor: z.string().nullable(),
  taskSummary: z.string(),
  taskCategory: z.enum(["code", "security", "design", "content", "social", "research", "other"]).catch("other"),
  online: z.boolean().nullable(),
  regionRestriction: z.string().nullable(),
  eligibilityNotes: z.array(z.string()).catch([]),
  preconditions: z.array(z.string()).catch([]),
  prizes: z.array(z.object({
    place: z.coerce.string(),
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    kind: z.enum(["cash", "crypto", "credits", "services", "discount", "merch", "other"]).catch("other"),
  })).catch([]),
  paymentMethod: z.string().nullable().catch(null),
  judging: z.array(z.string()).catch([]),
  deadline: z.string().nullable().catch(null),
  estimatedHours: z.number().nullable().catch(null),
  quotes: z.array(z.object({ fact: z.string(), quote: z.string() })).catch([]),
});

export function extractionMessages(bundle: SourceBundle) {
  return [
    {
      role: "system" as const,
      content:
        "You extract facts from opportunity listings (bounties, hackathons, grants) into JSON. " +
        "Use only what the page says; use null when unknown. Quotes must be copied verbatim from the page, never paraphrased. " +
        "A 'region' is a restriction on where participants live, not where the sponsor is. " +
        `Respond with JSON matching this schema: ${JSON.stringify(EXTRACTION_SCHEMA)}`,
    },
    {
      role: "user" as const,
      content: `URL: ${bundle.url}\nPlatform: ${bundle.platform}\n\nPAGE:\n${bundle.text.slice(0, MAX_PAGE_CHARS)}`,
    },
  ];
}

export async function extractFacts(io: IO, model: string, bundle: SourceBundle): Promise<Extraction> {
  const raw = await io.llmJson({
    model,
    schemaName: "extraction",
    schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown>,
    messages: extractionMessages(bundle),
  });
  const parsed = ExtractionZ.parse(raw);
  const quotes: Record<string, string> = {};
  for (const q of parsed.quotes) quotes[q.fact] ??= q.quote;
  return { ...parsed, quotes };
}

// ---------- verdict ----------

export const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "reasons", "eligible", "additionalFlags"],
  properties: {
    verdict: { type: "string", enum: ["APPLY", "CAUTION", "AVOID"] },
    summary: { type: "string", description: "Two sentences max, addressed to the user." },
    reasons: { type: "array", items: { type: "string" }, maxItems: 5 },
    eligible: { type: ["boolean", "null"] },
    additionalFlags: {
      type: "array",
      description: "Risks the rules missed. Each needs a verbatim quote from the page.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "quote", "explanation"],
        properties: { label: { type: "string" }, quote: { type: "string" }, explanation: { type: "string" } },
      },
    },
  },
} as const;

const VerdictZ = z.object({
  verdict: z.enum(["APPLY", "CAUTION", "AVOID"]),
  summary: z.string(),
  reasons: z.array(z.string()).catch([]),
  eligible: z.boolean().nullable().catch(null),
  additionalFlags: z.array(z.object({ label: z.string(), quote: z.string(), explanation: z.string() })).catch([]),
});
export type ModelVerdict = z.infer<typeof VerdictZ>;

export async function judge(
  io: IO,
  model: string,
  input: { bundle: SourceBundle; extraction: Extraction | null; flags: RedFlag[]; gate: Verdict; profile: Profile; evSummary: string },
): Promise<ModelVerdict> {
  const { bundle, extraction, flags, gate, profile, evSummary } = input;
  const raw = await io.llmJson({
    model,
    reasoning: true,
    schemaName: "verdict",
    schema: VERDICT_SCHEMA as unknown as Record<string, unknown>,
    messages: [
      {
        role: "system",
        content:
          "You are Opportunity Shield, a skeptical advisor protecting a developer's time from fake bounties, bait listings and ineligible opportunities. " +
          "Decide APPLY (worth the time and eligible), CAUTION (real but risky or poor odds) or AVOID (trap, ineligible, or not real money). " +
          `Deterministic rules already set a ceiling of ${gate}: you may be stricter, never more lenient. ` +
          "Only add flags you can support with a verbatim quote from the page. " +
          `Respond with JSON matching this schema: ${JSON.stringify(VERDICT_SCHEMA)}`,
      },
      {
        role: "user",
        content: [
          `PROFILE: ${JSON.stringify(profile)}`,
          `PLATFORM FACTS: ${JSON.stringify({ ...bundle.facts, raw: undefined })}`,
          `EXTRACTED: ${JSON.stringify(extraction)}`,
          `RULE FLAGS: ${JSON.stringify(flags.map((f) => ({ label: f.label, severity: f.severity, evidence: f.evidence[0]?.quote })))}`,
          `EXPECTED VALUE: ${evSummary}`,
          `PAGE (truncated):\n${bundle.text.slice(0, 12_000)}`,
        ].join("\n\n"),
      },
    ],
  });
  return VerdictZ.parse(raw);
}

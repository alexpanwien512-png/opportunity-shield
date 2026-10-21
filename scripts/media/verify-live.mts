// Pre-flight for recordings: both Nemotron models answer, then each demo example is analyzed fresh
// (force=true) through the running app and every timeline step must be green with a model verdict.
// A passing run also leaves every case warm in the cache.
// Usage: node --env-file=.env --import tsx scripts/media/verify-live.mts [base-url]
import OpenAI from "openai";
import { config } from "../../src/lib/shield/config";
import { modelFailureReason } from "../../src/lib/shield/live";

const BASE = (process.argv[2] ?? "http://localhost:3300").replace(/\/$/, "");
const EXAMPLES = [
  ["poem-star-farm", "https://github.com/SecureBananaLabs/bug-bounty/issues/76", "AVOID"],
  ["test-bounty-dm", "https://github.com/jomaaabbe78-spec/bookningsapp/issues/1", "AVOID"],
  ["germany-only", "https://superteam.fun/earn/listing/travel-boost-for-bp26", "AVOID"],
  ["audit-not-cash", "https://superteam.fun/earn/listing/vaultline-security-audit-grants-for-colosseum-projects-up-to-4000-usdc-each", "AVOID"],
  ["chimp-token-promo", "https://superteam.fun/earn/listing/chimp-on-metaplex", "CAUTION"],
  ["nebius-hackathon", "https://nebiusglobalaihackathon.devpost.com", "APPLY"],
] as const;

let ok = true;

// 1) Models answer at all (a 5-token call each).
const client = new OpenAI({ baseURL: config.nebiusBaseUrl, apiKey: config.nebiusApiKey, maxRetries: 2 });
for (const model of [config.fastModel, config.reasoningModel]) {
  const started = Date.now();
  try {
    await client.chat.completions.create({ model, messages: [{ role: "user", content: "Reply OK" }], max_tokens: 5 });
    console.log(`✓ ${model} answers (${Date.now() - started}ms)`);
  } catch (err) {
    console.log(`✗ ${model}: ${modelFailureReason(err)} — ${(err as Error).message.slice(0, 120)}`);
    ok = false;
  }
}
if (!ok) {
  console.log("\nStopping: fix model access first (e.g. add Token Factory credit), then re-run.");
  process.exit(1);
}

// 2) Each example, fresh, through the app's streaming endpoint.
for (const [name, url, expected] of EXAMPLES) {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ url, force: true }),
  });
  const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const steps = new Map<string, { status: string; detail?: string }>();
  for (const l of lines) if (l.type === "progress" && l.status !== "start") steps.set(l.step, l);
  const result = lines.find((l) => l.type === "result")?.result;
  const problems: string[] = [];
  for (const s of ["fetch", "extract", "eligibility", "flags", "verdict"]) {
    const st = steps.get(s);
    if (!st) problems.push(`${s}: missing`);
    else if (st.status !== "done") problems.push(`${s}: ${st.status} (${st.detail})`);
  }
  if (!result) problems.push(lines.find((l) => l.type === "error")?.error ?? "no result");
  else {
    if (!result.modelVerdict) problems.push("no model verdict");
    if (result.verdict !== expected) problems.push(`verdict ${result.verdict}, expected ${expected}`);
  }
  const t = result?.timingsMs ?? {};
  console.log(`${problems.length ? "✗" : "✓"} ${name}: ${result?.verdict ?? "—"} · fetch ${t.fetch ?? "?"}ms · Lightning ${t.extract ?? "?"}ms · Ultra ${t.verdict ?? "?"}ms${problems.length ? "\n    " + problems.join("\n    ") : ""}`);
  if (problems.length) ok = false;
}
process.exit(ok ? 0 : 1);

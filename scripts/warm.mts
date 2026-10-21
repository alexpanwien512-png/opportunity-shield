// Pre-computes the demo cases on a deployed instance so visitors with the default profile get
// instant, cached answers. Usage: npm run warm -- https://your-deployment.example
import { CASES } from "../fixtures/cases";

const base = (process.argv[2] ?? process.env.BASE_URL ?? "").replace(/\/$/, "");
if (!base) throw new Error("Usage: npm run warm -- <base-url>");

const health = await fetch(`${base}/api/health`).then((r) => r.json());
console.log("health:", health);
for (const c of CASES) {
  const started = Date.now();
  const res = await fetch(`${base}/api/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: c.url }) });
  const data = (await res.json()) as { verdict?: string; error?: string; cached?: boolean };
  const ok = data.verdict === c.expected ? "✓" : "✗";
  console.log(`${ok} ${c.id}: ${res.status} ${data.verdict ?? data.error}${data.cached ? " (cached)" : ""} in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

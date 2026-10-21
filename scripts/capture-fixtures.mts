// Runs every demo case live and records all I/O (GitHub/Superteam/Devpost APIs,
// Tavily, Nemotron) into fixtures/cases/<id>.json so tests replay offline.
// Usage: npm run capture [-- <case-id>]
import { CASES, DEMO_PROFILE } from "../fixtures/cases";
import { analyzeUrl } from "../src/lib/shield/analyze";
import { recordingIO, saveRecording, type Recording } from "../src/lib/shield/io";
import { liveIO } from "../src/lib/shield/live";
import { config } from "../src/lib/shield/config";

const only = process.argv[2];
const models = { fast: config.fastModel, reasoning: config.reasoningModel };

for (const c of CASES.filter((x) => !only || x.id === only)) {
  const recording: Recording = {};
  const started = Date.now();
  try {
    const result = await analyzeUrl(c.url, { io: recordingIO(liveIO, recording), profile: DEMO_PROFILE, models });
    recording["meta:capturedAt"] = new Date().toISOString();
    recording["meta:models"] = models;
    saveRecording(`fixtures/cases/${c.id}.json`, recording);
    const ok = result.verdict === c.expected ? "✓" : "✗";
    console.log(`${ok} ${c.id}: ${result.verdict} (gate ${result.gateVerdict}, model ${result.modelVerdict}) in ${Date.now() - started}ms`, result.timingsMs);
    console.log("   flags:", result.flags.map((f) => `${f.id}[${f.severity}]`).join(", ") || "none");
  } catch (err) {
    console.error(`✗ ${c.id}:`, err);
  }
}

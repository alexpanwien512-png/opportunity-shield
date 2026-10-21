// Lists Token Factory models (GET /v1/models?verbose=true) and highlights NVIDIA ones.
import { config } from "../src/lib/shield/config";

const res = await fetch(`${config.nebiusBaseUrl.replace(/\/$/, "")}/models?verbose=true`, {
  headers: { Authorization: `Bearer ${config.nebiusApiKey}` },
});
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const { data } = (await res.json()) as { data: Record<string, unknown>[] };
const nvidia = data.filter((m) => /nvidia|nemotron/i.test(String(m.id)));
for (const m of nvidia) console.log(JSON.stringify(m));
console.log(`\n${nvidia.length} NVIDIA models of ${data.length}. Configured: fast=${config.fastModel}, reasoning=${config.reasoningModel}`);
for (const id of [config.fastModel, config.reasoningModel]) {
  console.log(`${data.some((m) => m.id === id) ? "✓" : "✗ NOT FOUND"} ${id}`);
}

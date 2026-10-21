import { config } from "@/lib/shield/config";
import { store } from "@/lib/shield/store";

/** Liveness + configuration check for the hosting platform (never returns secrets). */
export async function GET() {
  let db = "ok";
  try {
    store().db.prepare("SELECT 1").get();
  } catch (err) {
    db = (err as Error).message;
  }
  return Response.json({
    ok: db === "ok",
    db,
    nebiusKey: !!config.nebiusApiKey,
    tavilyKey: !!config.tavilyApiKey,
    models: { fast: config.fastModel, reasoning: config.reasoningModel },
  });
}

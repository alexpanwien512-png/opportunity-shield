import { connection } from "next/server";
import { config } from "@/lib/shield/config";
import { store } from "@/lib/shield/store";

/** Liveness + configuration check for the hosting platform (never returns secrets). */
export async function GET() {
  // Must run per request: a build-time prerender would freeze the key status of the build machine.
  await connection();
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
    githubToken: !!config.githubToken,
    models: { fast: config.fastModel, reasoning: config.reasoningModel },
  });
}

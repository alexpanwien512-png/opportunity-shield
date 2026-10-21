import { RateLimited, ownerId, takeToken } from "@/lib/server/visitor";
import { liveIO } from "@/lib/shield/live";
import { scan } from "@/lib/shield/scan";
import { analyzeWithMemory, MODELS } from "@/lib/shield/service";
import { store } from "@/lib/shield/store";

export const maxDuration = 600;

/** Streams scan progress as NDJSON, one ScanEvent per line. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const owner = await ownerId();
  try {
    await takeToken("scan");
  } catch (err) {
    if (err instanceof RateLimited) return Response.json({ error: err.message }, { status: 429, headers: { "Retry-After": String(Math.ceil(err.retryAfterS)) } });
    throw err;
  }
  const db = store();
  const maxLimit = Number(process.env.SCAN_MAX_LIMIT ?? 12);
  const events = scan({
    io: liveIO,
    profile: db.getProfile(owner),
    blacklist: db.blacklistValues(owner),
    fastModel: MODELS.fast,
    // One scan token covers its deep analyses.
    analyze: (url) => analyzeWithMemory(owner, url),
    limit: Math.min(Math.max(body.limit ?? 6, 1), maxLimit),
    concurrency: 2,
  });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await events.next();
        if (done) return controller.close();
        controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
      } catch (err) {
        controller.enqueue(encoder.encode(JSON.stringify({ type: "failed", url: "", error: (err as Error).message }) + "\n"));
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}

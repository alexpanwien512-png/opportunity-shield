import { liveIO } from "@/lib/shield/live";
import { scan } from "@/lib/shield/scan";
import { analyzeWithMemory, MODELS } from "@/lib/shield/service";
import { store } from "@/lib/shield/store";

export const maxDuration = 600;

/** Streams scan progress as NDJSON, one ScanEvent per line. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { limit?: number };
  const db = store();
  const events = scan({
    io: liveIO,
    profile: db.getProfile(),
    blacklist: db.blacklistValues(),
    fastModel: MODELS.fast,
    analyze: (url) => analyzeWithMemory(url),
    limit: Math.min(Math.max(body.limit ?? 6, 1), 12),
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

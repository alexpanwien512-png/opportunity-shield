import { humanError } from "@/lib/server/errors";
import { RateLimited, ownerId, takeToken } from "@/lib/server/visitor";
import { analyzeWithMemory } from "@/lib/shield/service";
import type { ProgressEvent } from "@/lib/shield/types";

export const maxDuration = 300;

/**
 * POST { url, force? }. With `Accept: application/x-ndjson` it streams
 * {type:"progress"} lines and ends with {type:"result"} or {type:"error"}; otherwise plain JSON.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; force?: boolean };
  if (!body.url) return Response.json({ error: "Paste a link to analyze." }, { status: 400 });
  const owner = await ownerId();
  const streaming = request.headers.get("accept")?.includes("application/x-ndjson");

  const run = (onProgress?: (e: ProgressEvent) => void) =>
    analyzeWithMemory(owner, body.url!, { force: body.force, beforeLiveRun: () => takeToken("analyze"), onProgress });
  const failure = (err: unknown) => {
    if (err instanceof RateLimited) return { status: 429, error: err.message, retryAfter: Math.ceil(err.retryAfterS) };
    console.warn("analyze failed:", (err as Error).message);
    return { status: 422, error: humanError((err as Error).message) };
  };

  if (!streaming) {
    try {
      return Response.json(await run());
    } catch (err) {
      const f = failure(err);
      return Response.json({ error: f.error }, { status: f.status, headers: f.retryAfter ? { "Retry-After": String(f.retryAfter) } : undefined });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await run((e) => send({ type: "progress", ...e }));
        send({ type: "result", result });
      } catch (err) {
        const f = failure(err);
        send({ type: "error", error: f.error, status: f.status });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}

import { RateLimited, ownerId, takeToken } from "@/lib/server/visitor";
import { analyzeWithMemory } from "@/lib/shield/service";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; force?: boolean };
  if (!body.url) return Response.json({ error: "Missing url" }, { status: 400 });
  const owner = await ownerId();
  try {
    return Response.json(await analyzeWithMemory(owner, body.url, { force: body.force, beforeLiveRun: () => takeToken("analyze") }));
  } catch (err) {
    if (err instanceof RateLimited) return Response.json({ error: err.message }, { status: 429, headers: { "Retry-After": String(Math.ceil(err.retryAfterS)) } });
    return Response.json({ error: (err as Error).message }, { status: 422 });
  }
}

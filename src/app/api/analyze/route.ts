import { analyzeUrl } from "@/lib/shield/analyze";
import { config } from "@/lib/shield/config";
import { liveIO } from "@/lib/shield/live";
import { DEFAULT_PROFILE } from "@/lib/shield/profile";
import type { Profile } from "@/lib/shield/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; profile?: Profile };
  if (!body.url) return Response.json({ error: "Missing url" }, { status: 400 });
  try {
    const result = await analyzeUrl(body.url, {
      io: liveIO,
      profile: body.profile ?? DEFAULT_PROFILE,
      models: { fast: config.fastModel, reasoning: config.reasoningModel },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 422 });
  }
}

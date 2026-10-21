import { analyzeWithMemory } from "@/lib/shield/service";

export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: string; force?: boolean };
  if (!body.url) return Response.json({ error: "Missing url" }, { status: 400 });
  try {
    return Response.json(await analyzeWithMemory(body.url, { force: body.force }));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 422 });
  }
}

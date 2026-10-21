import { z } from "zod";
import { ownerId } from "@/lib/server/visitor";
import { store } from "@/lib/shield/store";

const ProfileZ = z.object({
  residenceCountry: z.string().trim().min(2).max(80),
  citizenship: z.array(z.string().trim().min(2).max(80)).max(5),
  skills: z.array(z.string().trim().min(1).max(60)).max(30),
  payoutPreferences: z.array(z.string().trim().min(1).max(40)).max(10),
  audience: z.array(z.object({ platform: z.string().trim().min(1).max(40), followers: z.number().int().min(0) })).max(10),
  hourlyRateUsd: z.number().min(0).max(10_000),
});

export async function GET() {
  const owner = await ownerId();
  return Response.json({ profile: store().getProfile(owner), saved: store().hasProfile(owner) });
}

export async function PUT(request: Request) {
  const owner = await ownerId();
  const parsed = ProfileZ.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  return Response.json({ profile: store().saveProfile(owner, parsed.data), saved: true });
}

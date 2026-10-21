import { z } from "zod";
import { store } from "@/lib/shield/store";

const ProfileZ = z.object({
  residenceCountry: z.string().trim().min(2),
  citizenship: z.array(z.string().trim().min(2)),
  skills: z.array(z.string().trim().min(1)),
  payoutPreferences: z.array(z.string().trim().min(1)),
  audience: z.array(z.object({ platform: z.string().trim().min(1), followers: z.number().int().min(0) })),
  hourlyRateUsd: z.number().min(0),
});

export async function GET() {
  return Response.json({ profile: store().getProfile(), saved: store().hasProfile() });
}

export async function PUT(request: Request) {
  const parsed = ProfileZ.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  return Response.json({ profile: store().saveProfile(parsed.data), saved: true });
}

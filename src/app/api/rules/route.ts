import { ownerId } from "@/lib/server/visitor";
import { store, type RuleOverride } from "@/lib/shield/store";

export async function GET() {
  return Response.json(store().getRules(await ownerId()));
}

export async function PUT(request: Request) {
  const owner = await ownerId();
  const body = (await request.json().catch(() => ({}))) as { id?: string; override?: RuleOverride };
  if (!body.id || !body.override) return Response.json({ error: "id and override are required" }, { status: 400 });
  try {
    store().saveRuleOverride(owner, body.id, body.override);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return Response.json(store().getRules(owner));
}

export async function DELETE(request: Request) {
  const owner = await ownerId();
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  store().resetRule(owner, id);
  return Response.json(store().getRules(owner));
}

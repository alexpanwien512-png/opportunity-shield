import { store, type RuleOverride } from "@/lib/shield/store";

export async function GET() {
  return Response.json(store().getRules());
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { id?: string; override?: RuleOverride };
  if (!body.id || !body.override) return Response.json({ error: "id and override are required" }, { status: 400 });
  try {
    store().saveRuleOverride(body.id, body.override);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 400 });
  }
  return Response.json(store().getRules());
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  store().resetRule(id);
  return Response.json(store().getRules());
}

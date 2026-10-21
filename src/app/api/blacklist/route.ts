import { ownerId } from "@/lib/server/visitor";
import { store, type BlacklistEntry } from "@/lib/shield/store";

const KINDS: BlacklistEntry["kind"][] = ["repo", "sponsor", "domain"];

export async function GET() {
  return Response.json(store().listBlacklist(await ownerId()));
}

export async function POST(request: Request) {
  const owner = await ownerId();
  const body = (await request.json().catch(() => ({}))) as Partial<BlacklistEntry>;
  if (!body.value?.trim() || body.value.length > 200 || !body.kind || !KINDS.includes(body.kind)) {
    return Response.json({ error: "value (≤200 chars) and kind (repo|sponsor|domain) are required" }, { status: 400 });
  }
  store().addBlacklist(owner, body.value, body.kind, (body.reason ?? "").slice(0, 200));
  return Response.json(store().listBlacklist(owner));
}

export async function DELETE(request: Request) {
  const owner = await ownerId();
  const value = new URL(request.url).searchParams.get("value");
  if (!value) return Response.json({ error: "Missing value" }, { status: 400 });
  store().removeBlacklist(owner, value);
  return Response.json(store().listBlacklist(owner));
}

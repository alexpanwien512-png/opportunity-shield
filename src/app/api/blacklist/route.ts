import { store, type BlacklistEntry } from "@/lib/shield/store";

const KINDS: BlacklistEntry["kind"][] = ["repo", "sponsor", "domain"];

export async function GET() {
  return Response.json(store().listBlacklist());
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Partial<BlacklistEntry>;
  if (!body.value?.trim() || !body.kind || !KINDS.includes(body.kind)) return Response.json({ error: "value and kind (repo|sponsor|domain) are required" }, { status: 400 });
  store().addBlacklist(body.value, body.kind, body.reason ?? "");
  return Response.json(store().listBlacklist());
}

export async function DELETE(request: Request) {
  const value = new URL(request.url).searchParams.get("value");
  if (!value) return Response.json({ error: "Missing value" }, { status: 400 });
  store().removeBlacklist(value);
  return Response.json(store().listBlacklist());
}

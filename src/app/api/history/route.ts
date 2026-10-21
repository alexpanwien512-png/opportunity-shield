import { ownerId } from "@/lib/server/visitor";
import { store } from "@/lib/shield/store";

export async function GET(request: Request) {
  const owner = await ownerId();
  const url = new URL(request.url).searchParams.get("url");
  if (url) return Response.json(store().getAnalysis(owner, url));
  return Response.json(store().listHistory(owner));
}

export async function DELETE(request: Request) {
  const owner = await ownerId();
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return Response.json({ error: "Missing url" }, { status: 400 });
  store().deleteHistory(owner, url);
  return Response.json({ ok: true });
}

import { store } from "@/lib/shield/store";

export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (url) return Response.json(store().getAnalysis(url));
  return Response.json(store().listHistory());
}

export async function DELETE(request: Request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return Response.json({ error: "Missing url" }, { status: 400 });
  store().deleteAnalysis(url);
  return Response.json({ ok: true });
}

import { NextResponse } from "next/server";
import { readRegistry, upsertWorkspaceCloud } from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readRegistry());
}

// Mirror a workspace into the cloud registry. Called by `datac init`/`setup`
// after the daemon starts, so every workspace exists in both stores.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[a-zA-Z0-9_-]+$/.test(id))
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  await upsertWorkspaceCloud(id, {
    title: typeof body.title === "string" ? body.title : undefined,
    color: typeof body.color === "string" ? body.color : undefined,
  });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

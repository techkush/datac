import { NextResponse } from "next/server";
import {
  readOpenApps,
  addOpenApp,
  updateOpenApp,
  deleteOpenApp,
} from "@/lib/datac/openapps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readOpenApps());
}

export async function POST(req: Request) {
  let body: { title?: string; icon?: string; app?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const entry = await addOpenApp(body.title || "", body.icon || "", body.app || "");
  if (!entry)
    return NextResponse.json({ error: "title and app required" }, { status: 400 });
  return NextResponse.json(entry, { status: 201 });
}

export async function PATCH(req: Request) {
  let body: { id?: string; title?: string; icon?: string; app?: string } = {};
  try {
    body = await req.json();
  } catch {}
  if (!body.id)
    return NextResponse.json({ error: "id required" }, { status: 400 });
  const entry = await updateOpenApp(
    body.id,
    body.title || "",
    body.icon || "",
    body.app || "",
  );
  if (!entry)
    return NextResponse.json({ error: "not found or invalid" }, { status: 400 });
  return NextResponse.json(entry);
}

export async function DELETE(req: Request) {
  let id = "";
  try {
    id = ((await req.json()) as { id?: string }).id || "";
  } catch {}
  const ok = await deleteOpenApp(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

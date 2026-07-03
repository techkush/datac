import { NextResponse } from "next/server";
import {
  readQuickLinks,
  addQuickLink,
  updateQuickLink,
  deleteQuickLink,
} from "@/lib/datac/quicklinks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readQuickLinks());
}

export async function POST(req: Request) {
  let body: { title?: string; url?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const link = await addQuickLink(body.title || "", body.url || "");
  if (!link)
    return NextResponse.json({ error: "title and a valid http(s) url required" }, { status: 400 });
  return NextResponse.json(link, { status: 201 });
}

export async function PATCH(req: Request) {
  let body: { id?: string; title?: string; url?: string } = {};
  try {
    body = await req.json();
  } catch {}
  if (!body.id)
    return NextResponse.json({ error: "id required" }, { status: 400 });
  const link = await updateQuickLink(body.id, body.title || "", body.url || "");
  if (!link)
    return NextResponse.json({ error: "not found or invalid" }, { status: 400 });
  return NextResponse.json(link);
}

export async function DELETE(req: Request) {
  let id = "";
  try {
    id = ((await req.json()) as { id?: string }).id || "";
  } catch {}
  const ok = await deleteQuickLink(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

import { NextResponse } from "next/server";
import { readRegistry } from "@/lib/datac/registry";
import { addFocus, focusForWorkspace } from "@/lib/datac/focus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Day-bucketed focus seconds for one workspace: { days, total }.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const days = await focusForWorkspace(id);
  const total = Object.values(days).reduce((a, b) => a + b, 0);
  return NextResponse.json({ days, total });
}

// Heartbeat from an open workspace tab: { seconds } focused since last ping.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reg = await readRegistry();
  if (!reg[id])
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  let seconds = 0;
  try {
    seconds = Number(((await req.json()) as { seconds?: number }).seconds);
  } catch {}
  if (!Number.isFinite(seconds) || seconds <= 0)
    return NextResponse.json({ error: "bad seconds" }, { status: 400 });
  await addFocus(id, seconds);
  return NextResponse.json({ ok: true });
}

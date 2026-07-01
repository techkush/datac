import { NextResponse } from "next/server";
import { deleteWorkspace } from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await deleteWorkspace(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

import fs from "fs";
import { NextResponse } from "next/server";
import { workspaceDir } from "@/lib/datac/registry";
import { osOpen } from "@/lib/datac/os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open a file by absolute path.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataDir = await workspaceDir(id);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const p = body?.path;
  if (!p) return NextResponse.json({ error: "path required" }, { status: 400 });
  if (!fs.existsSync(p))
    return NextResponse.json({ error: "file not found" }, { status: 404 });
  osOpen(p);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { readRegistry, workspaceDir } from "@/lib/datac/registry";
import { osOpen } from "@/lib/datac/os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Open the project folder in the OS file manager (local, trusted registry path).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataDir = await workspaceDir(id);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const reg = await readRegistry();
  const w = reg[id] || {};
  const dir = w.projectDir || dataDir;
  osOpen(dir);
  return NextResponse.json({ ok: true, dir });
}

import { NextResponse } from "next/server";
import { workspaceDir } from "@/lib/datac/registry";
import { pickFile } from "@/lib/datac/os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Native file picker — returns the chosen file's absolute path (no copy).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataDir = await workspaceDir(id);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  return NextResponse.json(await pickFile());
}

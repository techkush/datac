import { NextResponse } from "next/server";
import {
  readRegistry,
  workspaceDir,
  workspaceExists,
} from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await workspaceExists(id)))
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const dataDir = await workspaceDir(id);
  const reg = await readRegistry();
  const w = reg[id] || {};
  return NextResponse.json({
    id,
    title: w.title || "Untitled",
    projectDir: w.projectDir,
    dataDir,
  });
}

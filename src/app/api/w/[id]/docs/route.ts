import crypto from "crypto";
import { NextResponse } from "next/server";
import { workspaceDir, workspaceExists } from "@/lib/datac/registry";
import { listDocs, saveDoc } from "@/lib/datac/docs";

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
  return NextResponse.json(await listDocs(id, dataDir));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!(await workspaceExists(id)))
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const dataDir = await workspaceDir(id);
  const body = await req.json().catch(() => ({}));
  const docId = crypto.randomBytes(8).toString("hex");
  return NextResponse.json(await saveDoc(id, dataDir, docId, body), {
    status: 201,
  });
}

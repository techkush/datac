import { NextResponse } from "next/server";
import { workspaceDir } from "@/lib/datac/registry";
import { deleteDoc, getDoc, safeId, saveDoc } from "@/lib/datac/docs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolve(params: Promise<{ id: string; docId: string }>) {
  const { id, docId } = await params;
  const dataDir = await workspaceDir(id);
  return { dataDir, docId: safeId(docId) };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { dataDir, docId } = await resolve(params);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  if (!docId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  try {
    return NextResponse.json(await getDoc(dataDir, docId));
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { dataDir, docId } = await resolve(params);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  if (!docId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await saveDoc(dataDir, docId, body));
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { dataDir, docId } = await resolve(params);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  if (!docId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await deleteDoc(dataDir, docId);
  return NextResponse.json({ ok: true });
}

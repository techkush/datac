import { NextResponse } from "next/server";
import { workspaceDir, workspaceExists } from "@/lib/datac/registry";
import { safeId } from "@/lib/datac/docs";
import { deleteBoard, getBoard, saveBoard } from "@/lib/datac/boards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolve(params: Promise<{ id: string; boardId: string }>) {
  const { id, boardId } = await params;
  const exists = await workspaceExists(id);
  const dataDir = exists ? await workspaceDir(id) : null;
  return { ws: id, exists, dataDir, boardId: safeId(boardId) };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; boardId: string }> },
) {
  const { ws, exists, dataDir, boardId } = await resolve(params);
  if (!exists)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  if (!boardId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const board = await getBoard(ws, dataDir, boardId);
  if (!board)
    return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(board);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string; boardId: string }> },
) {
  const { ws, exists, dataDir, boardId } = await resolve(params);
  if (!exists)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  if (!boardId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  return NextResponse.json(await saveBoard(ws, dataDir, boardId, body));
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; boardId: string }> },
) {
  const { ws, exists, dataDir, boardId } = await resolve(params);
  if (!exists)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  if (!boardId) return NextResponse.json({ error: "bad id" }, { status: 400 });
  await deleteBoard(ws, dataDir, boardId);
  return NextResponse.json({ ok: true });
}

import crypto from "crypto";
import { NextResponse } from "next/server";
import { workspaceDir, workspaceExists } from "@/lib/datac/registry";
import { listBoards, saveBoard } from "@/lib/datac/boards";

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
  return NextResponse.json(await listBoards(id, dataDir));
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
  const boardId = crypto.randomBytes(8).toString("hex");
  return NextResponse.json(
    await saveBoard(id, dataDir, boardId, {
      name: typeof body.name === "string" ? body.name : "Untitled board",
      parent: typeof body.parent === "string" ? body.parent : "",
      cards: [],
    }),
    { status: 201 },
  );
}

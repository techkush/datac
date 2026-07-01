import fs from "fs";
import path from "path";
import crypto from "crypto";
import { NextResponse } from "next/server";
import { workspaceDir } from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const fsp = fs.promises;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataDir = await workspaceDir(id);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { name, dataUrl } = body || {};
  if (!dataUrl || !name)
    return NextResponse.json(
      { error: "name and dataUrl required" },
      { status: 400 },
    );
  const m = String(dataUrl).match(/^data:([^;]+);base64,(.*)$/s);
  if (!m) return NextResponse.json({ error: "bad dataUrl" }, { status: 400 });

  const buf = Buffer.from(m[2], "base64");
  const ext = path.extname(name).toLowerCase() || "";
  const safeBase =
    path
      .basename(name, ext)
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 40) || "file";
  const fname = `${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")}-${safeBase}${ext}`;
  const filesDir = path.join(dataDir, "files");
  await fsp.mkdir(filesDir, { recursive: true });
  await fsp.writeFile(path.join(filesDir, fname), buf);
  return NextResponse.json(
    { url: `/api/w/${id}/files/${fname}`, name, size: buf.length },
    { status: 201 },
  );
}

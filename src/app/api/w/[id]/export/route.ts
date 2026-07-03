import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { Readable } from "stream";
import path from "path";
import { readRegistry, workspaceDir } from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stream the project folder as a zip download, skipping heavy build/VCS
// directories. Uses the system `zip` writing to stdout.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataDir = await workspaceDir(id);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const reg = await readRegistry();
  const dir = reg[id]?.projectDir || dataDir;
  const name = path.basename(dir) || "workspace";

  const zip = spawn(
    "zip",
    [
      "-r",
      "-q",
      "-",
      ".",
      "-x",
      "node_modules/*",
      "*/node_modules/*",
      ".git/*",
      ".next/*",
      "*.DS_Store",
    ],
    { cwd: dir },
  );

  const stream = Readable.toWeb(zip.stdout) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}.zip"`,
    },
  });
}

import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { readRegistry, workspaceDir } from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function run(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(cmd, args, (err) => resolve(!err));
  });
}

// Project-level desktop actions launched from the statistics panel.
// The directory comes from the trusted local registry, never the request.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dataDir = await workspaceDir(id);
  if (!dataDir)
    return NextResponse.json({ error: "unknown workspace" }, { status: 404 });
  const reg = await readRegistry();
  const dir = reg[id]?.projectDir || dataDir;

  let action = "";
  try {
    action = ((await req.json()) as { action?: string }).action || "";
  } catch {}

  if (process.platform !== "darwin")
    return NextResponse.json({ error: "macOS only" }, { status: 501 });

  let ok = false;
  switch (action) {
    case "vscode":
      // Prefer the `code` CLI (opens as a folder); fall back to the app bundle.
      ok =
        (await run("code", [dir])) ||
        (await run("open", ["-a", "Visual Studio Code", dir]));
      break;
    case "terminal":
      ok = await run("open", ["-a", "Terminal", dir]);
      break;
    default:
      return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  return NextResponse.json({ ok, dir }, { status: ok ? 200 : 500 });
}

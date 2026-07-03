import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { readOpenApps } from "@/lib/datac/openapps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function openMacApp(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("open", ["-a", name], (err) => resolve(!err));
  });
}

// Launch a saved app by its id. The application name is looked up in the
// user's own launcher list (~/.datac/openapps.json), never taken from the
// request, so only apps the user configured can be opened.
export async function POST(req: Request) {
  let id = "";
  try {
    id = ((await req.json()) as { id?: string }).id || "";
  } catch {}
  const entry = (await readOpenApps()).find((a) => a.id === id);
  if (!entry)
    return NextResponse.json({ error: "unknown app" }, { status: 404 });
  if (process.platform !== "darwin")
    return NextResponse.json({ ok: false, error: "macOS only" }, { status: 501 });
  const ok = await openMacApp(entry.app);
  return NextResponse.json({ ok });
}

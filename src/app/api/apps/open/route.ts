import { NextResponse } from "next/server";
import { execFile } from "child_process";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Whitelisted desktop apps the home page can launch, with web fallbacks
// the client opens when the native app is missing.
const APPS: Record<string, { mac: string; web: string }> = {
  todo: { mac: "Microsoft To Do", web: "https://to-do.office.com" },
  outlook: { mac: "Microsoft Outlook", web: "https://outlook.office.com/mail" },
};

function openMacApp(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("open", ["-a", name], (err) => resolve(!err));
  });
}

export async function POST(req: Request) {
  let key = "";
  try {
    key = ((await req.json()) as { app?: string }).app || "";
  } catch {}
  const app = APPS[key];
  if (!app)
    return NextResponse.json({ error: "unknown app" }, { status: 400 });
  const ok = process.platform === "darwin" ? await openMacApp(app.mac) : false;
  return NextResponse.json({ ok, web: app.web });
}

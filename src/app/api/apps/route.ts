import { NextResponse } from "next/server";
import { listInstalledApps } from "@/lib/datac/apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// List installed applications by name, for the "select the system app" picker.
export async function GET() {
  if (process.platform !== "darwin") return NextResponse.json({ apps: [] });
  return NextResponse.json({ apps: await listInstalledApps() });
}

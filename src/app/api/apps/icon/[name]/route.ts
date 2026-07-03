import { NextResponse } from "next/server";
import fs from "fs";
import { appIconPng } from "@/lib/datac/apps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The real macOS icon of an installed app as a 64px PNG (cached on disk).
// 404 when the app has no extractable .icns — the client falls back to a
// generic icon.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const app = decodeURIComponent(name);
  // App names come from directory listings; refuse anything path-like.
  if (!app || app.includes("/") || app.includes("\\") || app.includes(".."))
    return NextResponse.json({ error: "bad name" }, { status: 400 });
  if (process.platform !== "darwin")
    return NextResponse.json({ error: "macOS only" }, { status: 404 });

  const png = await appIconPng(app);
  if (!png) return NextResponse.json({ error: "no icon" }, { status: 404 });
  const buf = await fs.promises.readFile(png);
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

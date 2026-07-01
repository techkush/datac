import { NextResponse } from "next/server";
import { readRegistry } from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await readRegistry());
}

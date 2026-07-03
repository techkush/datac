import { NextResponse } from "next/server";
import {
  trashWorkspace,
  restoreWorkspace,
  removeWorkspaceEntry,
} from "@/lib/datac/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Move to / restore from the home-page trash.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let action = "";
  try {
    action = ((await req.json()) as { action?: string }).action || "";
  } catch {}
  if (action !== "trash" && action !== "restore")
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const ok =
    action === "trash" ? await trashWorkspace(id) : await restoreWorkspace(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

// "Delete forever": removes only the registry entry. Files on disk —
// the project folder, dataC notes and open.dc — are never touched.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ok = await removeWorkspaceEntry(id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

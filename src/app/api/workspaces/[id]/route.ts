import { NextResponse } from "next/server";
import {
  trashWorkspace,
  restoreWorkspace,
  removeWorkspaceEntry,
  updateWorkspaceMeta,
} from "@/lib/datac/registry";
import { isWorkspaceColor } from "@/lib/datac/colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Move to / restore from the home-page trash, or update title / accent color.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { action?: string; title?: string; color?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {}
  const action = body.action || "";

  if (action === "update") {
    const patch: { title?: string; color?: string } = {};
    if (typeof body.title === "string" && body.title.trim())
      patch.title = body.title.trim();
    if (typeof body.color === "string") {
      if (body.color && !isWorkspaceColor(body.color))
        return NextResponse.json({ error: "unknown color" }, { status: 400 });
      patch.color = body.color;
    }
    if (!("title" in patch) && !("color" in patch))
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    const ok = await updateWorkspaceMeta(id, patch);
    return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
  }

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

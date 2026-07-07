import fs from "fs";
import { REGISTRY } from "./paths";
import { writeJsonAtomic } from "./store";
import { prisma } from "@/lib/db/prisma";
import type { Registry } from "./types";

// The local registry (~/.datac/workspaces.json) is the only place that knows a
// workspace's machine-specific paths (projectDir/dataDir), used to read/write
// local files (uploads live under dataDir/files). The Postgres `workspaces`
// table mirrors machine-independent metadata (title, color, trashed) so the
// cloud app — which has no local folders — still knows which workspaces exist
// and can serve their Postgres-backed pages and boards.

function readLocalRegistry(): Registry {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY, "utf8")) as Registry;
  } catch {
    return {};
  }
}

async function readCloudWorkspaces(): Promise<Registry> {
  try {
    const rows = await prisma.workspace.findMany();
    const out: Registry = {};
    for (const r of rows) {
      out[r.id] = {
        title: r.title,
        ...(r.color ? { color: r.color } : {}),
        ...(r.trashedAt ? { trashed: r.trashedAt.toISOString() } : {}),
        created: r.createdAt.toISOString(),
      };
    }
    return out;
  } catch {
    return {};
  }
}

// Merged view: cloud rows provide existence/metadata for every machine; local
// entries overlay them with this machine's paths and take precedence.
export async function readRegistry(): Promise<Registry> {
  const cloud = await readCloudWorkspaces();
  const local = readLocalRegistry();
  const merged: Registry = { ...cloud };
  for (const [id, w] of Object.entries(local)) {
    merged[id] = { ...merged[id], ...w };
  }
  return merged;
}

// Local-only writer — paths live solely in the JSON file.
export async function writeRegistry(reg: Registry): Promise<void> {
  await writeJsonAtomic(REGISTRY, reg);
}

// Mirror a workspace's metadata into Postgres. Best-effort: a cloud outage
// must never break local workspace creation/editing.
export async function upsertWorkspaceCloud(
  id: string,
  data: { title?: string; color?: string },
): Promise<void> {
  try {
    await prisma.workspace.upsert({
      where: { id },
      create: { id, title: data.title || "Untitled", color: data.color || "" },
      update: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        updatedAt: new Date(),
      },
    });
  } catch {}
}

// Local path for a workspace's files, or null when this machine doesn't have
// it (a cloud-only workspace). Callers must treat null as "no local files",
// not "unknown workspace" — use workspaceExists for validity.
export async function workspaceDir(id: string): Promise<string | null> {
  const ws = readLocalRegistry()[id];
  return (ws?.dataDir as string | undefined) || null;
}

// A workspace is valid if this machine knows it OR it exists in the cloud.
export async function workspaceExists(id: string): Promise<boolean> {
  if (readLocalRegistry()[id]) return true;
  try {
    return !!(await prisma.workspace.findUnique({ where: { id } }));
  } catch {
    return false;
  }
}

// Update home-page display settings: title and/or accent border color.
// An empty color clears the accent back to the default border.
export async function updateWorkspaceMeta(
  id: string,
  patch: { title?: string; color?: string },
): Promise<boolean> {
  const reg = readLocalRegistry();
  if (reg[id]) {
    if (patch.title !== undefined) reg[id].title = patch.title;
    if (patch.color !== undefined) {
      if (patch.color) reg[id].color = patch.color;
      else delete reg[id].color;
    }
    await writeRegistry(reg);
  }
  await upsertWorkspaceCloud(id, patch);
  return true;
}

// Soft-delete: flag the entry as trashed in both stores. Nothing on disk
// changes; local files and the Postgres pages/boards are untouched.
export async function trashWorkspace(id: string): Promise<boolean> {
  const reg = readLocalRegistry();
  if (reg[id]) {
    reg[id].trashed = new Date().toISOString();
    await writeRegistry(reg);
  }
  try {
    await prisma.workspace.update({
      where: { id },
      data: { trashedAt: new Date() },
    });
  } catch {}
  return true;
}

// Bring a trashed workspace back to the active list.
export async function restoreWorkspace(id: string): Promise<boolean> {
  const reg = readLocalRegistry();
  if (reg[id]) {
    delete reg[id].trashed;
    await writeRegistry(reg);
  }
  try {
    await prisma.workspace.update({ where: { id }, data: { trashedAt: null } });
  } catch {}
  return true;
}

// "Delete forever": drop the registry entry (both stores). The project folder,
// its dataC notes/files and open.dc are left untouched, and the Postgres
// pages/boards remain — reopening open.dc (or `datac open`) re-registers it.
export async function removeWorkspaceEntry(id: string): Promise<boolean> {
  const reg = readLocalRegistry();
  if (reg[id]) {
    delete reg[id];
    await writeRegistry(reg);
  }
  try {
    await prisma.workspace.delete({ where: { id } });
  } catch {}
  return true;
}

// Stamp the last-opened time (called when the workspace page is visited).
// Opened time is a local UX concern (home-page ordering); kept local-only.
export async function touchOpened(id: string): Promise<void> {
  const reg = readLocalRegistry();
  if (!reg[id]) return;
  reg[id].opened = new Date().toISOString();
  try {
    await writeRegistry(reg);
  } catch {}
}

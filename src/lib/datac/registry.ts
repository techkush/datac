import fs from "fs";
import { REGISTRY } from "./paths";
import { writeJsonAtomic } from "./store";
import type { Registry } from "./types";

const fsp = fs.promises;

// The workspace registry is a single local JSON file (~/.datac/workspaces.json)
// written by the `datac` CLI. It holds each workspace's title, accent color,
// and machine paths (projectDir/dataDir). Page/board content lives in the
// database keyed by workspace id; files live under dataDir/files.

export async function readRegistry(): Promise<Registry> {
  try {
    return JSON.parse(await fsp.readFile(REGISTRY, "utf8")) as Registry;
  } catch {
    return {};
  }
}

export async function writeRegistry(reg: Registry): Promise<void> {
  await writeJsonAtomic(REGISTRY, reg);
}

export async function workspaceDir(id: string): Promise<string | null> {
  const reg = await readRegistry();
  const ws = reg[id];
  if (!ws || !ws.dataDir) return null;
  return ws.dataDir as string;
}

// Update home-page display settings: title and/or accent border color.
// An empty color clears the accent back to the default border.
export async function updateWorkspaceMeta(
  id: string,
  patch: { title?: string; color?: string },
): Promise<boolean> {
  const reg = await readRegistry();
  if (!reg[id]) return false;
  if (patch.title !== undefined) reg[id].title = patch.title;
  if (patch.color !== undefined) {
    if (patch.color) reg[id].color = patch.color;
    else delete reg[id].color;
  }
  await writeRegistry(reg);
  return true;
}

// Soft-delete: flag the entry as trashed. Nothing on disk changes.
export async function trashWorkspace(id: string): Promise<boolean> {
  const reg = await readRegistry();
  if (!reg[id]) return false;
  reg[id].trashed = new Date().toISOString();
  await writeRegistry(reg);
  return true;
}

// Bring a trashed workspace back to the active list.
export async function restoreWorkspace(id: string): Promise<boolean> {
  const reg = await readRegistry();
  if (!reg[id]) return false;
  delete reg[id].trashed;
  await writeRegistry(reg);
  return true;
}

// "Delete forever": drop the registry entry only. The project folder, its
// dataC notes and open.dc are left untouched — reopening open.dc (or running
// `datac open` there) re-registers the workspace.
export async function removeWorkspaceEntry(id: string): Promise<boolean> {
  const reg = await readRegistry();
  if (!reg[id]) return false;
  delete reg[id];
  await writeRegistry(reg);
  return true;
}

// Stamp the last-opened time (called when the workspace page is visited).
export async function touchOpened(id: string): Promise<void> {
  const reg = await readRegistry();
  if (!reg[id]) return;
  reg[id].opened = new Date().toISOString();
  try {
    await writeRegistry(reg);
  } catch {}
}

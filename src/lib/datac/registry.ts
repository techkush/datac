import fs from "fs";
import { DATAC_HOME, REGISTRY } from "./paths";
import type { Registry } from "./types";

const fsp = fs.promises;

export async function readRegistry(): Promise<Registry> {
  try {
    return JSON.parse(await fsp.readFile(REGISTRY, "utf8")) as Registry;
  } catch {
    return {};
  }
}

export async function writeRegistry(reg: Registry): Promise<void> {
  await fsp.mkdir(DATAC_HOME, { recursive: true });
  await fsp.writeFile(REGISTRY, JSON.stringify(reg, null, 2));
}

export async function workspaceDir(id: string): Promise<string | null> {
  const reg = await readRegistry();
  const ws = reg[id];
  if (!ws || !ws.dataDir) return null;
  return ws.dataDir;
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

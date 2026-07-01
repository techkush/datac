import fs from "fs";
import path from "path";
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

// Remove a workspace: delete its dataC data + open.dc + registry entry.
// Only remove the project folder itself if it is left completely empty.
export async function deleteWorkspace(id: string): Promise<boolean> {
  const reg = await readRegistry();
  const w = reg[id];
  if (!w) return false;
  if (w.dataDir) {
    try {
      await fsp.rm(w.dataDir, { recursive: true, force: true });
    } catch {}
  }
  if (w.projectDir) {
    try {
      await fsp.unlink(path.join(w.projectDir, "open.dc"));
    } catch {}
    try {
      const rest = await fsp.readdir(w.projectDir);
      if (!rest.length) await fsp.rmdir(w.projectDir);
    } catch {}
  }
  delete reg[id];
  try {
    await writeRegistry(reg);
  } catch {}
  return true;
}

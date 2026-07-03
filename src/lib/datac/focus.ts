import fs from "fs";
import path from "path";
import { DATAC_HOME } from "./paths";
import type { FocusLog } from "./types";

const fsp = fs.promises;
const FOCUS = path.join(DATAC_HOME, "focus.json");

// Cap a single heartbeat so a stuck client can't inflate the log.
const MAX_HEARTBEAT_SECONDS = 120;

// Local-time day key, e.g. "2026-07-03" — the app runs on the user's machine,
// so server-local time is the user's time.
export function dayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function readFocusLog(): Promise<FocusLog> {
  try {
    return JSON.parse(await fsp.readFile(FOCUS, "utf8")) as FocusLog;
  } catch {
    return {};
  }
}

async function writeFocusLog(log: FocusLog): Promise<void> {
  await fsp.mkdir(DATAC_HOME, { recursive: true });
  await fsp.writeFile(FOCUS, JSON.stringify(log, null, 2));
}

// Add focused seconds to today's bucket for one workspace.
export async function addFocus(id: string, seconds: number): Promise<void> {
  const s = Math.min(Math.max(0, Math.floor(seconds)), MAX_HEARTBEAT_SECONDS);
  if (!s) return;
  const log = await readFocusLog();
  const days = log[id] || (log[id] = {});
  const key = dayKey();
  days[key] = (days[key] || 0) + s;
  await writeFocusLog(log);
}

// Day buckets for one workspace (missing days are absent, not zero).
export async function focusForWorkspace(
  id: string,
): Promise<Record<string, number>> {
  const log = await readFocusLog();
  return log[id] || {};
}

// All-time focused seconds per workspace id — for the home-page cards.
export async function focusTotals(): Promise<Record<string, number>> {
  const log = await readFocusLog();
  const totals: Record<string, number> = {};
  for (const [id, days] of Object.entries(log)) {
    totals[id] = Object.values(days).reduce((a, b) => a + b, 0);
  }
  return totals;
}

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DATAC_HOME } from "./paths";
import { writeJsonAtomic } from "./store";
import type { OpenApp } from "./types";

const fsp = fs.promises;
const APPS = path.join(DATAC_HOME, "openapps.json");

// Icons are lucide icon names (e.g. "Mail"); the client renders them and
// falls back to a generic icon for unknown names.
const DEFAULT_ICON = "AppWindow";

// First-run defaults — the two launchers the home page used to hardcode.
const DEFAULTS: Array<Pick<OpenApp, "title" | "icon" | "app">> = [
  { title: "Microsoft To Do", icon: "ListTodo", app: "Microsoft To Do" },
  { title: "Outlook", icon: "Mail", app: "Microsoft Outlook" },
];

// Entries saved before the lucide switch used emoji icons — map them over.
const EMOJI_MIGRATION: Record<string, string> = {
  "✅": "ListTodo",
  "📧": "Mail",
  "📦": DEFAULT_ICON,
};

function newId(): string {
  return crypto.randomBytes(8).toString("hex");
}

function isIconName(s: string): boolean {
  return /^[A-Za-z0-9]+$/.test(s);
}

export async function readOpenApps(): Promise<OpenApp[]> {
  try {
    const list = JSON.parse(await fsp.readFile(APPS, "utf8"));
    if (!Array.isArray(list)) return [];
    const apps = list as OpenApp[];
    let migrated = false;
    for (const a of apps) {
      if (!isIconName(a.icon || "")) {
        a.icon = EMOJI_MIGRATION[a.icon] || DEFAULT_ICON;
        migrated = true;
      }
    }
    if (migrated) {
      try {
        await writeOpenApps(apps);
      } catch {}
    }
    return apps;
  } catch {
    // No file yet: seed with the defaults so existing behavior is kept.
    const seeded = DEFAULTS.map((d) => ({
      ...d,
      id: newId(),
      created: new Date().toISOString(),
    }));
    try {
      await writeOpenApps(seeded);
    } catch {}
    return seeded;
  }
}

async function writeOpenApps(list: OpenApp[]): Promise<void> {
  await writeJsonAtomic(APPS, list);
}

function clean(title: string, icon: string, app: string) {
  const i = (icon || "").trim();
  return {
    title: (title || "").trim(),
    icon: isIconName(i) ? i : "",
    app: (app || "").trim(),
  };
}

export async function addOpenApp(
  title: string,
  icon: string,
  app: string,
): Promise<OpenApp | null> {
  const c = clean(title, icon, app);
  if (!c.title || !c.app) return null;
  const entry: OpenApp = {
    id: newId(),
    title: c.title,
    icon: c.icon || DEFAULT_ICON,
    app: c.app,
    created: new Date().toISOString(),
  };
  const list = await readOpenApps();
  list.push(entry);
  await writeOpenApps(list);
  return entry;
}

export async function updateOpenApp(
  id: string,
  title: string,
  icon: string,
  app: string,
): Promise<OpenApp | null> {
  const c = clean(title, icon, app);
  if (!c.title || !c.app) return null;
  const list = await readOpenApps();
  const entry = list.find((a) => a.id === id);
  if (!entry) return null;
  entry.title = c.title;
  entry.icon = c.icon || DEFAULT_ICON;
  entry.app = c.app;
  await writeOpenApps(list);
  return entry;
}

export async function deleteOpenApp(id: string): Promise<boolean> {
  const list = await readOpenApps();
  const next = list.filter((a) => a.id !== id);
  if (next.length === list.length) return false;
  await writeOpenApps(next);
  return true;
}

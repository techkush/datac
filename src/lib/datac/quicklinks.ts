import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DATAC_HOME } from "./paths";
import { writeJsonAtomic } from "./store";
import type { QuickLink } from "./types";

const fsp = fs.promises;
const LINKS = path.join(DATAC_HOME, "quicklinks.json");

export async function readQuickLinks(): Promise<QuickLink[]> {
  try {
    const list = JSON.parse(await fsp.readFile(LINKS, "utf8"));
    return Array.isArray(list) ? (list as QuickLink[]) : [];
  } catch {
    return [];
  }
}

async function writeQuickLinks(list: QuickLink[]): Promise<void> {
  await writeJsonAtomic(LINKS, list);
}

// Require an absolute http(s) URL; prepend https:// for bare domains.
export function normalizeUrl(raw: string): string | null {
  const s = (raw || "").trim();
  if (!s) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href;
  } catch {
    return null;
  }
}

export async function addQuickLink(
  title: string,
  url: string,
): Promise<QuickLink | null> {
  const href = normalizeUrl(url);
  const name = (title || "").trim();
  if (!href || !name) return null;
  const link: QuickLink = {
    id: crypto.randomBytes(8).toString("hex"),
    title: name,
    url: href,
    created: new Date().toISOString(),
  };
  const list = await readQuickLinks();
  list.push(link);
  await writeQuickLinks(list);
  return link;
}

export async function updateQuickLink(
  id: string,
  title: string,
  url: string,
): Promise<QuickLink | null> {
  const href = normalizeUrl(url);
  const name = (title || "").trim();
  if (!href || !name) return null;
  const list = await readQuickLinks();
  const link = list.find((l) => l.id === id);
  if (!link) return null;
  link.title = name;
  link.url = href;
  await writeQuickLinks(list);
  return link;
}

export async function deleteQuickLink(id: string): Promise<boolean> {
  const list = await readQuickLinks();
  const next = list.filter((l) => l.id !== id);
  if (next.length === list.length) return false;
  await writeQuickLinks(next);
  return true;
}

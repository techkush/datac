import fs from "fs";
import path from "path";
import type { Block, DocSummary } from "./types";

const fsp = fs.promises;

/* ---- frontmatter (legacy markdown) ------------------------------------- */
interface ParsedDoc {
  meta: Record<string, string>;
  body: string;
}

export function parseDoc(raw: string): ParsedDoc {
  const meta: Record<string, string> = {
    title: "Untitled",
  };
  let body = raw;
  if (raw.startsWith("---")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      const fm = raw.slice(3, end).trim();
      body = raw.slice(end + 4).replace(/^\r?\n/, "");
      for (const line of fm.split("\n")) {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  }
  return { meta, body };
}

export const safeId = (id: string): string | null =>
  /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;

export function safeParse<T>(s: string | undefined, fallback: T): T {
  try {
    return JSON.parse(s ?? "") as T;
  } catch {
    return fallback;
  }
}

// Ordered list of child page ids as they appear in a doc's block flow.
export function collectPageIds(blocks: Block[] | undefined, out: string[]) {
  for (const b of blocks || []) {
    if (b.type === "page" && b.pageId) out.push(b.pageId);
    else if (b.type === "columns" && Array.isArray(b.cols))
      b.cols.forEach((col) => collectPageIds(col, out));
  }
}

/* ---- document ops (scoped to a dataDir) --------------------------------
 * Canonical store is <id>.json (a block-tree document). Legacy <id>.md
 * files are still read and reported, then migrated to JSON on first save. */
export async function listDocs(dataDir: string): Promise<DocSummary[]> {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(dataDir);
  } catch {
    return [];
  }
  const byId: Record<string, DocSummary & { _json: boolean }> = {};
  for (const name of entries) {
    let id: string;
    let isJson: boolean;
    if (name.endsWith(".json")) {
      id = name.slice(0, -5);
      isJson = true;
    } else if (name.endsWith(".md")) {
      id = name.slice(0, -3);
      isJson = false;
    } else continue;
    if (byId[id] && byId[id]._json) continue; // a .json wins over a legacy .md
    try {
      const raw = await fsp.readFile(path.join(dataDir, name), "utf8");
      let title: string | undefined,
        icon: string | undefined,
        updated: string | null = null,
        created: string | null = null,
        parent = "",
        orphaned = false,
        status = "";
      const childOrder: string[] = [];
      if (isJson) {
        const d = JSON.parse(raw);
        title = d.title;
        icon = d.icon;
        updated = d.updated ?? null;
        created = d.created ?? null;
        parent = d.parent || "";
        orphaned = !!d.orphaned;
        status = d.status || "";
        collectPageIds(d.blocks, childOrder);
      } else {
        const { meta } = parseDoc(raw);
        title = meta.title;
        icon = meta.icon;
        updated = meta.updated ?? null;
        created = meta.created ?? null;
      }
      byId[id] = {
        id,
        title: title || "Untitled",
        icon: icon || "",
        updated,
        created,
        parent,
        orphaned,
        status,
        childOrder,
        _json: isJson,
      };
    } catch {}
  }
  const docs = Object.values(byId).map(({ _json, ...d }) => {
    void _json;
    return d;
  });
  docs.sort((a, b) =>
    String(b.updated || "").localeCompare(String(a.updated || "")),
  );
  return docs;
}

export async function getDoc(dataDir: string, id: string) {
  // prefer JSON
  try {
    const d = JSON.parse(
      await fsp.readFile(path.join(dataDir, id + ".json"), "utf8"),
    );
    return { id, format: "json" as const, ...d };
  } catch {}
  // fall back to legacy markdown (client migrates it)
  const { meta, body } = parseDoc(
    await fsp.readFile(path.join(dataDir, id + ".md"), "utf8"),
  );
  return {
    id,
    format: "markdown" as const,
    title: meta.title || "Untitled",
    icon: meta.icon || "",
    cover: meta.cover || "",
    comments: safeParse(meta.comments, {}),
    styles: safeParse(meta.styles, {}),
    content: body,
    updated: meta.updated,
    created: meta.created,
  };
}

export interface SaveDocInput {
  title?: string;
  icon?: string;
  cover?: string;
  parent?: string;
  orphaned?: boolean;
  status?: string;
  created?: string;
  blocks?: Block[];
  comments?: Record<string, unknown>;
}

export async function saveDoc(
  dataDir: string,
  id: string,
  doc: SaveDocInput,
) {
  const jf = path.join(dataDir, id + ".json");
  let created = doc.created || new Date().toISOString();
  try {
    const e = JSON.parse(await fsp.readFile(jf, "utf8"));
    if (e.created) created = e.created;
  } catch {
    try {
      const { meta } = parseDoc(
        await fsp.readFile(path.join(dataDir, id + ".md"), "utf8"),
      );
      if (meta.created) created = meta.created;
    } catch {}
  }
  const updated = new Date().toISOString();
  const out = {
    title: doc.title || "Untitled",
    icon: doc.icon || "",
    cover: doc.cover || "",
    parent: doc.parent || "",
    orphaned: !!doc.orphaned,
    status: doc.status || "",
    created,
    updated,
    blocks: Array.isArray(doc.blocks) ? doc.blocks : [],
    comments:
      doc.comments && typeof doc.comments === "object" ? doc.comments : {},
  };
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.writeFile(jf, JSON.stringify(out, null, 2), "utf8");
  return { id, title: out.title, icon: out.icon, updated, created };
}

export async function deleteDoc(dataDir: string, id: string) {
  for (const ext of [".json", ".md"]) {
    try {
      await fsp.unlink(path.join(dataDir, id + ext));
    } catch {}
  }
}

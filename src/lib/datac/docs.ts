import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, Doc } from "@/generated/prisma";
import type { Block, DocSummary } from "./types";
import {
  isBlockNoteDoc,
  collectBnPageIds,
  type BnBlock,
} from "./blocknote-convert";

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
  if (isBlockNoteDoc(blocks)) {
    collectBnPageIds(blocks as unknown as BnBlock[], out);
    return;
  }
  for (const b of blocks || []) {
    if (b.type === "page" && b.pageId) out.push(b.pageId);
    else if (b.type === "columns" && Array.isArray(b.cols))
      b.cols.forEach((col) => collectPageIds(col, out));
  }
}

/* ---- document ops (Postgres system of record) ---------------------------
 * Docs live in the `docs` table keyed by (workspaceId, docId); every
 * content-changing save appends a DocRevision snapshot, so no save can
 * destroy a page irrecoverably. The dataC/ folder keeps only uploads
 * (files/) and open.dc: pre-DB <id>.json files are imported into the DB
 * on first access, and legacy <id>.md files are still served from disk
 * until the client migrates them with a save. */

const REVISIONS_KEPT = 100;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const rowBlocks = (row: Doc) => (row.blocks ?? []) as unknown as Block[];

interface FileDoc {
  title?: string;
  icon?: string;
  cover?: string;
  parent?: string;
  orphaned?: boolean;
  status?: string;
  created?: string;
  updated?: string;
  blocks?: Block[];
  comments?: Record<string, unknown>;
}

const parseDate = (s: string | undefined | null) => {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};

// One-time adoption of a pre-DB <id>.json file into Postgres.
async function importFileDoc(
  workspaceId: string,
  dataDir: string,
  docId: string,
): Promise<Doc | null> {
  let d: FileDoc;
  try {
    d = JSON.parse(
      await fsp.readFile(path.join(dataDir, docId + ".json"), "utf8"),
    );
  } catch {
    return null;
  }
  const created = parseDate(d.created) || new Date();
  const updated = parseDate(d.updated) || created;
  try {
    return await prisma.doc.create({
      data: {
        workspaceId,
        docId,
        title: d.title || "Untitled",
        icon: d.icon || "",
        cover: d.cover || "",
        parent: d.parent || "",
        orphaned: !!d.orphaned,
        status: d.status || "",
        blocks: asJson(Array.isArray(d.blocks) ? d.blocks : []),
        comments: asJson(
          d.comments && typeof d.comments === "object" ? d.comments : {},
        ),
        createdAt: created,
        updatedAt: updated,
        revisions: {
          create: {
            title: d.title || "Untitled",
            blocks: asJson(Array.isArray(d.blocks) ? d.blocks : []),
            comments: asJson(
              d.comments && typeof d.comments === "object" ? d.comments : {},
            ),
            cause: "import",
          },
        },
      },
    });
  } catch {
    // Unique-constraint race with a concurrent import: the row exists now.
    return prisma.doc.findUnique({
      where: { workspaceId_docId: { workspaceId, docId } },
    });
  }
}

// Adopt every not-yet-imported <id>.json in the workspace folder. Docs the
// DB already knows (even soft-deleted ones) are left alone so a deleted
// page's stale mirror can't resurrect itself.
async function importFileDocs(workspaceId: string, dataDir: string) {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(dataDir);
  } catch {
    return;
  }
  const ids = entries
    .filter((n) => n.endsWith(".json") && !n.startsWith("."))
    .map((n) => n.slice(0, -5))
    .filter((id) => safeId(id));
  if (!ids.length) return;
  const known = new Set(
    (
      await prisma.doc.findMany({
        where: { workspaceId },
        select: { docId: true },
      })
    ).map((r) => r.docId),
  );
  for (const id of ids) {
    if (!known.has(id)) await importFileDoc(workspaceId, dataDir, id);
  }
}

// Legacy markdown docs still on disk (served until first save migrates them).
async function listLegacyMd(dataDir: string, skip: Set<string>) {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(dataDir);
  } catch {
    return [];
  }
  const out: DocSummary[] = [];
  for (const name of entries) {
    if (!name.endsWith(".md") || name.startsWith(".")) continue;
    const id = name.slice(0, -3);
    if (!safeId(id) || skip.has(id)) continue;
    try {
      const { meta } = parseDoc(
        await fsp.readFile(path.join(dataDir, name), "utf8"),
      );
      out.push({
        id,
        title: meta.title || "Untitled",
        icon: meta.icon || "",
        updated: meta.updated ?? null,
        created: meta.created ?? null,
        parent: "",
        orphaned: false,
        status: "",
        childOrder: [],
      });
    } catch {}
  }
  return out;
}

export async function listDocs(
  workspaceId: string,
  dataDir: string,
): Promise<DocSummary[]> {
  await importFileDocs(workspaceId, dataDir);
  const rows = await prisma.doc.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  const docs: DocSummary[] = rows.map((row) => {
    const childOrder: string[] = [];
    collectPageIds(rowBlocks(row), childOrder);
    return {
      id: row.docId,
      title: row.title,
      icon: row.icon,
      updated: iso(row.updatedAt),
      created: iso(row.createdAt),
      parent: row.parent,
      orphaned: row.orphaned,
      status: row.status,
      childOrder,
    };
  });
  const known = new Set(rows.map((r) => r.docId));
  docs.push(...(await listLegacyMd(dataDir, known)));
  docs.sort((a, b) =>
    String(b.updated || "").localeCompare(String(a.updated || "")),
  );
  return docs;
}

export async function getDoc(
  workspaceId: string,
  dataDir: string,
  docId: string,
) {
  let row = await prisma.doc.findUnique({
    where: { workspaceId_docId: { workspaceId, docId } },
  });
  if (!row) row = await importFileDoc(workspaceId, dataDir, docId);
  if (row && !row.deletedAt) {
    return {
      id: docId,
      format: "json" as const,
      title: row.title,
      icon: row.icon,
      cover: row.cover,
      parent: row.parent,
      orphaned: row.orphaned,
      status: row.status,
      blocks: rowBlocks(row),
      comments: (row.comments ?? {}) as Record<string, unknown>,
      created: iso(row.createdAt),
      updated: iso(row.updatedAt),
    };
  }
  // fall back to legacy markdown (client migrates it on first save)
  const { meta, body } = parseDoc(
    await fsp.readFile(path.join(dataDir, docId + ".md"), "utf8"),
  );
  return {
    id: docId,
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
  // Explicit opt-in to replace non-empty content with an empty document.
  allowEmpty?: boolean;
}

export async function saveDoc(
  workspaceId: string,
  dataDir: string,
  docId: string,
  doc: SaveDocInput,
) {
  const existing = await prisma.doc.findUnique({
    where: { workspaceId_docId: { workspaceId, docId } },
  });

  let blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  // Destructive-save guard: a live editor always has at least one block
  // (an empty page is one empty paragraph), so an empty *array* replacing
  // real content is a client bug (e.g. serializing a not-yet-loaded
  // editor), not a user action. Keep the stored blocks, save meta only.
  let blocksPreserved = false;
  if (
    existing &&
    !existing.deletedAt &&
    blocks.length === 0 &&
    rowBlocks(existing).length > 0 &&
    !doc.allowEmpty
  ) {
    blocks = rowBlocks(existing);
    blocksPreserved = true;
  }

  const comments =
    doc.comments && typeof doc.comments === "object" ? doc.comments : {};
  const title = doc.title || "Untitled";
  const now = new Date();
  const createdAt =
    existing?.createdAt || parseDate(doc.created) || now;

  const contentChanged =
    !existing ||
    existing.title !== title ||
    JSON.stringify(existing.blocks ?? []) !== JSON.stringify(blocks) ||
    JSON.stringify(existing.comments ?? {}) !== JSON.stringify(comments);

  const data = {
    title,
    icon: doc.icon || "",
    cover: doc.cover || "",
    parent: doc.parent || "",
    orphaned: !!doc.orphaned,
    status: doc.status || "",
    blocks: asJson(blocks),
    comments: asJson(comments),
    deletedAt: null,
    updatedAt: now,
  };

  const row = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.doc.update({ where: { id: existing.id }, data })
      : await tx.doc.create({
          data: { ...data, workspaceId, docId, createdAt },
        });
    if (contentChanged) {
      await tx.docRevision.create({
        data: {
          docRef: saved.id,
          title,
          blocks: asJson(blocks),
          comments: asJson(comments),
          cause: existing ? "save" : "create",
        },
      });
      // keep the newest REVISIONS_KEPT snapshots per doc
      const overflow = await tx.docRevision.findMany({
        where: { docRef: saved.id },
        orderBy: { createdAt: "desc" },
        skip: REVISIONS_KEPT,
        take: 1,
        select: { createdAt: true },
      });
      if (overflow.length) {
        await tx.docRevision.deleteMany({
          where: { docRef: saved.id, createdAt: { lte: overflow[0].createdAt } },
        });
      }
    }
    return saved;
  });

  // migrated from legacy markdown — keep it as .bak so it isn't a live doc
  try {
    await fsp.rename(
      path.join(dataDir, docId + ".md"),
      path.join(dataDir, docId + ".md.bak"),
    );
  } catch {}

  return {
    id: docId,
    title: row.title,
    icon: row.icon,
    updated: iso(row.updatedAt)!,
    created: iso(row.createdAt)!,
    ...(blocksPreserved ? { blocksPreserved: true } : {}),
  };
}

// Soft delete: the row is flagged and a final snapshot is appended, so
// revisions stay recoverable. Any pre-DB file for the id is removed too.
export async function deleteDoc(
  workspaceId: string,
  dataDir: string,
  docId: string,
) {
  const existing = await prisma.doc.findUnique({
    where: { workspaceId_docId: { workspaceId, docId } },
  });
  if (existing && !existing.deletedAt) {
    await prisma.$transaction([
      prisma.docRevision.create({
        data: {
          docRef: existing.id,
          title: existing.title,
          blocks: asJson(existing.blocks ?? []),
          comments: asJson(existing.comments ?? {}),
          cause: "delete",
        },
      }),
      prisma.doc.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }
  for (const ext of [".json", ".md"]) {
    try {
      await fsp.unlink(path.join(dataDir, docId + ext));
    } catch {}
  }
}

import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db/prisma";
import type { Prisma, Board } from "@/generated/prisma";
import { safeId } from "./docs";
import type {
  BoardArrow,
  BoardCard,
  BoardFile,
  BoardSummary,
  Camera,
} from "./board-types";

const fsp = fs.promises;

export const boardsDir = (dataDir: string) => path.join(dataDir, "boards");

/* ---- board ops (Postgres system of record) -------------------------------
 * Boards live in the `boards` table keyed by (workspaceId, boardId); every
 * content-changing save appends a BoardRevision snapshot, same as
 * documents. Pre-DB <dataC>/boards/*.json files are imported on first
 * access; nothing is written back to the folder. */

const REVISIONS_KEPT = 100;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const asJson = (v: unknown) => v as Prisma.InputJsonValue;
const rowCards = (row: Board) => (row.cards ?? []) as unknown as BoardCard[];
const rowArrows = (row: Board) =>
  (row.arrows ?? []) as unknown as BoardArrow[];

// Columns used to dock cards (children/columnId pointers). That design is
// gone — columns are collapsible note sections now. Free any legacy docked
// cards, fanning them out just under their old column so nothing vanishes.
function reconcileColumns(cards: BoardCard[]): BoardCard[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const c of cards) {
    if (c.type !== "column") continue;
    (Array.isArray(c.children) ? c.children : []).forEach((id, i) => {
      const child = byId.get(id);
      if (child) {
        child.x = c.x + 20;
        child.y = c.y + 48 + i * 90;
      }
    });
    c.children = [];
  }
  for (const c of cards) if (c.columnId) delete c.columnId;
  return cards;
}

// Keep only arrows whose both ends resolve to existing, distinct cards.
function sanitizeArrows(arrows: unknown, cards: BoardCard[]): BoardArrow[] {
  if (!Array.isArray(arrows)) return [];
  const ids = new Set(cards.map((c) => c.id));
  return (arrows as BoardArrow[]).filter(
    (a) =>
      a &&
      typeof a.id === "string" &&
      a.from !== a.to &&
      ids.has(a.from) &&
      ids.has(a.to),
  );
}

function rowToMirror(row: Board): BoardFile {
  const viewport = row.viewport as unknown as Camera | null;
  return {
    name: row.name,
    parent: row.parent,
    created: iso(row.createdAt)!,
    updated: iso(row.updatedAt)!,
    ...(viewport ? { viewport } : {}),
    cards: rowCards(row),
    arrows: rowArrows(row),
  };
}

const parseDate = (s: string | undefined | null) => {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d.getTime()) ? d : null;
};

// One-time adoption of a pre-DB boards/<id>.json file into Postgres.
async function importFileBoard(
  workspaceId: string,
  dataDir: string,
  boardId: string,
): Promise<Board | null> {
  let b: BoardFile;
  try {
    b = JSON.parse(
      await fsp.readFile(path.join(boardsDir(dataDir), boardId + ".json"), "utf8"),
    ) as BoardFile;
  } catch {
    return null;
  }
  const cards = reconcileColumns(Array.isArray(b.cards) ? b.cards : []);
  const arrows = sanitizeArrows(b.arrows, cards);
  const created = parseDate(b.created) || new Date();
  const updated = parseDate(b.updated) || created;
  try {
    return await prisma.board.create({
      data: {
        workspaceId,
        boardId,
        name: b.name || "Untitled board",
        parent: b.parent || "",
        viewport: b.viewport ? asJson(b.viewport) : undefined,
        cards: asJson(cards),
        arrows: asJson(arrows),
        createdAt: created,
        updatedAt: updated,
        revisions: {
          create: {
            name: b.name || "Untitled board",
            cards: asJson(cards),
            arrows: asJson(arrows),
            cause: "import",
          },
        },
      },
    });
  } catch {
    // Unique-constraint race with a concurrent import: the row exists now.
    return prisma.board.findUnique({
      where: { workspaceId_boardId: { workspaceId, boardId } },
    });
  }
}

// Adopt every not-yet-imported board file. Boards the DB already knows
// (even soft-deleted ones) are left alone.
async function importFileBoards(workspaceId: string, dataDir: string) {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(boardsDir(dataDir));
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
      await prisma.board.findMany({
        where: { workspaceId },
        select: { boardId: true },
      })
    ).map((r) => r.boardId),
  );
  for (const id of ids) {
    if (!known.has(id)) await importFileBoard(workspaceId, dataDir, id);
  }
}

export async function listBoards(
  workspaceId: string,
  dataDir: string,
): Promise<BoardSummary[]> {
  await importFileBoards(workspaceId, dataDir);
  const rows = await prisma.board.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  const boards: BoardSummary[] = rows.map((row) => ({
    id: row.boardId,
    name: row.name,
    parent: row.parent,
    created: iso(row.createdAt),
    updated: iso(row.updatedAt),
    cardCount: rowCards(row).length,
  }));
  // Orphan rescue: list consumers show only root boards (!parent), so a
  // child whose parent was deleted would become unreachable — surface it
  // as a root instead.
  const ids = new Set(boards.map((b) => b.id));
  for (const b of boards) if (b.parent && !ids.has(b.parent)) b.parent = "";
  return boards;
}

export async function getBoard(
  workspaceId: string,
  dataDir: string,
  id: string,
): Promise<(BoardFile & { id: string }) | null> {
  if (!safeId(id)) return null;
  let row = await prisma.board.findUnique({
    where: { workspaceId_boardId: { workspaceId, boardId: id } },
  });
  if (!row) row = await importFileBoard(workspaceId, dataDir, id);
  if (!row || row.deletedAt) return null;
  const cards = reconcileColumns(rowCards(row));
  return {
    ...rowToMirror(row),
    id,
    cards,
    arrows: sanitizeArrows(rowArrows(row), cards),
  };
}

export interface SaveBoardInput {
  name?: string;
  parent?: string;
  viewport?: Camera;
  cards?: BoardCard[];
  arrows?: BoardArrow[];
  created?: string;
}

export async function saveBoard(
  workspaceId: string,
  dataDir: string,
  id: string,
  board: SaveBoardInput,
) {
  const existing = await prisma.board.findUnique({
    where: { workspaceId_boardId: { workspaceId, boardId: id } },
  });
  const viewport =
    board.viewport ?? (existing?.viewport as unknown as Camera | null);
  const now = new Date();
  const createdAt = existing?.createdAt || parseDate(board.created) || now;
  // Renumber z to 0..n-1 (stable) so bring-to-front can't grow unbounded.
  const cards = reconcileColumns(Array.isArray(board.cards) ? board.cards : [])
    .slice()
    .sort((a, b) => (a.z || 0) - (b.z || 0))
    .map((c, i) => ({ ...c, z: i }));
  const arrows = sanitizeArrows(board.arrows, cards);
  const name = board.name || "Untitled board";

  const contentChanged =
    !existing ||
    existing.name !== name ||
    JSON.stringify(existing.cards ?? []) !== JSON.stringify(cards) ||
    JSON.stringify(existing.arrows ?? []) !== JSON.stringify(arrows);

  const data = {
    name,
    parent: board.parent || "",
    viewport: viewport ? asJson(viewport) : undefined,
    cards: asJson(cards),
    arrows: asJson(arrows),
    deletedAt: null,
    updatedAt: now,
  };

  const row = await prisma.$transaction(async (tx) => {
    const saved = existing
      ? await tx.board.update({ where: { id: existing.id }, data })
      : await tx.board.create({
          data: { ...data, workspaceId, boardId: id, createdAt },
        });
    if (contentChanged) {
      await tx.boardRevision.create({
        data: {
          boardRef: saved.id,
          name,
          cards: asJson(cards),
          arrows: asJson(arrows),
          cause: existing ? "save" : "create",
        },
      });
      const overflow = await tx.boardRevision.findMany({
        where: { boardRef: saved.id },
        orderBy: { createdAt: "desc" },
        skip: REVISIONS_KEPT,
        take: 1,
        select: { createdAt: true },
      });
      if (overflow.length) {
        await tx.boardRevision.deleteMany({
          where: {
            boardRef: saved.id,
            createdAt: { lte: overflow[0].createdAt },
          },
        });
      }
    }
    return saved;
  });

  return {
    id,
    name: row.name,
    parent: row.parent,
    updated: iso(row.updatedAt)!,
    created: iso(row.createdAt)!,
  };
}

// Soft delete: a final snapshot is appended and only the mirror file is
// removed. No cascade: child boards keep a parent id that no longer
// resolves and are treated as roots by consumers.
export async function deleteBoard(
  workspaceId: string,
  dataDir: string,
  id: string,
) {
  const existing = await prisma.board.findUnique({
    where: { workspaceId_boardId: { workspaceId, boardId: id } },
  });
  if (existing && !existing.deletedAt) {
    await prisma.$transaction([
      prisma.boardRevision.create({
        data: {
          boardRef: existing.id,
          name: existing.name,
          cards: asJson(existing.cards ?? []),
          arrows: asJson(existing.arrows ?? []),
          cause: "delete",
        },
      }),
      prisma.board.update({
        where: { id: existing.id },
        data: { deletedAt: new Date() },
      }),
    ]);
  }
  try {
    await fsp.unlink(path.join(boardsDir(dataDir), id + ".json"));
  } catch {}
}

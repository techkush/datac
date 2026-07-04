import fs from "fs";
import path from "path";
import { safeId } from "./docs";
import type { BoardCard, BoardFile, BoardSummary, Camera } from "./board-types";

const fsp = fs.promises;

export const boardsDir = (dataDir: string) => path.join(dataDir, "boards");

/* ---- board ops (scoped to a dataDir) ------------------------------------
 * One JSON file per board: <dataDir>/boards/<boardId>.json. No index file —
 * the directory is scanned, like listDocs does for documents. */

export async function listBoards(dataDir: string): Promise<BoardSummary[]> {
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(boardsDir(dataDir));
  } catch {
    return [];
  }
  const boards: BoardSummary[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await fsp.readFile(path.join(boardsDir(dataDir), name), "utf8");
      const b = JSON.parse(raw) as BoardFile;
      boards.push({
        id: name.slice(0, -5),
        name: b.name || "Untitled board",
        parent: b.parent || "",
        created: b.created ?? null,
        updated: b.updated ?? null,
        cardCount: Array.isArray(b.cards) ? b.cards.length : 0,
      });
    } catch {}
  }
  boards.sort((a, b) =>
    String(b.updated || "").localeCompare(String(a.updated || "")),
  );
  return boards;
}

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

export async function getBoard(
  dataDir: string,
  id: string,
): Promise<(BoardFile & { id: string }) | null> {
  if (!safeId(id)) return null;
  try {
    const raw = await fsp.readFile(
      path.join(boardsDir(dataDir), id + ".json"),
      "utf8",
    );
    const b = JSON.parse(raw) as BoardFile;
    return {
      ...b,
      id,
      name: b.name || "Untitled board",
      parent: b.parent || "",
      cards: reconcileColumns(Array.isArray(b.cards) ? b.cards : []),
    };
  } catch {
    return null;
  }
}

export interface SaveBoardInput {
  name?: string;
  parent?: string;
  viewport?: Camera;
  cards?: BoardCard[];
  created?: string;
}

export async function saveBoard(
  dataDir: string,
  id: string,
  board: SaveBoardInput,
) {
  const dir = boardsDir(dataDir);
  const file = path.join(dir, id + ".json");
  let created = board.created || new Date().toISOString();
  let viewport = board.viewport;
  try {
    const e = JSON.parse(await fsp.readFile(file, "utf8")) as BoardFile;
    if (e.created) created = e.created;
    if (!viewport && e.viewport) viewport = e.viewport;
  } catch {}
  const updated = new Date().toISOString();
  // Renumber z to 0..n-1 (stable) so bring-to-front can't grow unbounded.
  const cards = reconcileColumns(
    Array.isArray(board.cards) ? board.cards : [],
  )
    .slice()
    .sort((a, b) => (a.z || 0) - (b.z || 0))
    .map((c, i) => ({ ...c, z: i }));
  const out: BoardFile = {
    name: board.name || "Untitled board",
    parent: board.parent || "",
    created,
    updated,
    ...(viewport ? { viewport } : {}),
    cards,
  };
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(file, JSON.stringify(out, null, 2), "utf8");
  return { id, name: out.name, parent: out.parent, updated, created };
}

export async function deleteBoard(dataDir: string, id: string) {
  // No cascade: child boards keep a parent id that no longer resolves and
  // are treated as roots by consumers — nothing is destroyed transitively.
  try {
    await fsp.unlink(path.join(boardsDir(dataDir), id + ".json"));
  } catch {}
}

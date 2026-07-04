"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient, type DatacClient } from "@/lib/datac/client";
import { randomId } from "@/lib/datac/constants";
import type {
  BoardCard,
  BoardFile,
  BoardSummary,
  Camera,
} from "@/lib/datac/board-types";
import { DEFAULT_CAMERA } from "@/lib/datac/board-types";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface BoardContextValue {
  client: DatacClient;
  ws: string;
  boardId: string;
  wsTitle: string;
  wsColor: string;
  boardName: string;
  boards: BoardSummary[];
  cards: BoardCard[];
  camera: Camera;
  selection: ReadonlySet<string>;
  saveState: SaveState;
  // Full-screen draw mode; editId set when re-editing an existing sketch.
  drawMode: { editId?: string } | null;
  openDraw: (editId?: string) => void;
  closeDraw: () => void;

  addCard: (card: Omit<BoardCard, "z">) => void;
  updateCard: (id: string, patch: Partial<BoardCard>) => void;
  updateCards: (batch: Record<string, Partial<BoardCard>>) => void;
  removeCards: (ids: string[]) => void;
  duplicateCards: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  dockCard: (cardId: string, columnId: string, index: number) => void;
  undockCard: (cardId: string, x: number, y: number) => void;
  setCamera: (cam: Camera) => void;
  setSelection: (sel: Set<string>) => void;
  renameBoard: (name: string) => void;
  refreshBoards: () => Promise<void>;
  createBoard: (name: string, parent?: string) => Promise<string | null>;
  saveNow: (keepalive?: boolean) => Promise<void>;
  deleteBoard: () => Promise<void>;
}

const BoardContext = React.createContext<BoardContextValue | null>(null);

export function useBoard(): BoardContextValue {
  const ctx = React.useContext(BoardContext);
  if (!ctx) throw new Error("useBoard must be used within BoardProvider");
  return ctx;
}

const nextZ = (cards: BoardCard[]) =>
  cards.reduce((m, c) => Math.max(m, c.z), -1) + 1;

export function BoardProvider({
  ws,
  info,
  board,
  boards: initialBoards,
  children,
}: {
  ws: string;
  info: { title: string; color: string };
  board: BoardFile & { id: string };
  boards: BoardSummary[];
  children: React.ReactNode;
}) {
  const client = React.useMemo(() => createClient(ws), [ws]);
  const [cards, setCards] = React.useState<BoardCard[]>(board.cards);
  const [camera, setCameraState] = React.useState<Camera>(
    board.viewport || DEFAULT_CAMERA,
  );
  const [boardName, setBoardName] = React.useState(board.name);
  const [boards, setBoards] = React.useState<BoardSummary[]>(initialBoards);
  const [selection, setSelectionState] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [saveState, setSaveState] = React.useState<SaveState>("saved");
  const [drawMode, setDrawMode] = React.useState<{ editId?: string } | null>(
    null,
  );

  // Live refs so the debounced save always reads the latest values.
  const cardsRef = React.useRef(cards);
  const cameraRef = React.useRef(camera);
  const nameRef = React.useRef(boardName);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const deletedRef = React.useRef(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  cardsRef.current = cards;
  cameraRef.current = camera;
  nameRef.current = boardName;

  const saveNow = React.useCallback(
    async (keepalive = false) => {
      if (savingRef.current || deletedRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      savingRef.current = true;
      dirtyRef.current = false;
      try {
        await client.saveBoard(
          board.id,
          {
            name: nameRef.current.trim() || "Untitled board",
            parent: board.parent,
            viewport: cameraRef.current,
            cards: cardsRef.current,
          },
          keepalive,
        );
        setSaveState("saved");
      } catch {
        dirtyRef.current = true;
        setSaveState("error");
      } finally {
        savingRef.current = false;
        if (dirtyRef.current) queueSave();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, board.id, board.parent],
  );

  const queueSave = React.useCallback(() => {
    dirtyRef.current = true;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(), 700);
  }, [saveNow]);

  /* ---- card mutations (each queues a save) ------------------------------ */

  const mutateCards = React.useCallback(
    (fn: (cards: BoardCard[]) => BoardCard[]) => {
      setCards((cs) => {
        const next = fn(cs);
        cardsRef.current = next;
        return next;
      });
      queueSave();
    },
    [queueSave],
  );

  const addCard = React.useCallback(
    (card: Omit<BoardCard, "z">) => {
      mutateCards((cs) => [...cs, { ...card, z: nextZ(cs) } as BoardCard]);
      setSelectionState(new Set([card.id]));
    },
    [mutateCards],
  );

  const updateCard = React.useCallback(
    (id: string, patch: Partial<BoardCard>) => {
      mutateCards((cs) =>
        cs.map((c) => (c.id === id ? ({ ...c, ...patch } as BoardCard) : c)),
      );
    },
    [mutateCards],
  );

  const updateCards = React.useCallback(
    (batch: Record<string, Partial<BoardCard>>) => {
      mutateCards((cs) =>
        cs.map((c) =>
          batch[c.id] ? ({ ...c, ...batch[c.id] } as BoardCard) : c,
        ),
      );
    },
    [mutateCards],
  );

  const removeCards = React.useCallback(
    (ids: string[]) => {
      const gone = new Set(ids);
      // deleting a column also frees (not deletes) its docked cards
      mutateCards((cs) =>
        cs
          .filter((c) => !gone.has(c.id))
          .map((c) => {
            if (c.columnId && gone.has(c.columnId)) {
              const { columnId, ...rest } = c;
              void columnId;
              return rest as BoardCard;
            }
            if (c.type === "column")
              return { ...c, children: c.children.filter((k) => !gone.has(k)) };
            return c;
          }),
      );
      setSelectionState((sel) => {
        const next = new Set(sel);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    },
    [mutateCards],
  );

  const duplicateCards = React.useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids);
      const created: BoardCard[] = [];
      mutateCards((cs) => {
        let z = nextZ(cs);
        const byId = new Map(cs.map((c) => [c.id, c]));
        for (const c of cs) {
          if (!wanted.has(c.id)) continue;
          // a docked card duplicates as a free card next to its column
          const anchor =
            c.columnId && byId.get(c.columnId) ? byId.get(c.columnId)! : c;
          if (c.type === "column") {
            // clone the column together with its docked children
            const kidClones = c.children
              .map((k) => byId.get(k))
              .filter((k): k is BoardCard => !!k)
              .map((k) => ({ ...structuredClone(k), id: randomId(), z: z++ }));
            const col = {
              ...structuredClone(c),
              id: randomId(),
              x: c.x + 24,
              y: c.y + 24,
              z: z++,
              children: kidClones.map((k) => k.id),
            };
            kidClones.forEach((k) => (k.columnId = col.id));
            created.push(...kidClones, col);
          } else {
            const clone = {
              ...structuredClone(c),
              id: randomId(),
              x: anchor.x + 24,
              y: anchor.y + 24,
              z: z++,
            };
            delete clone.columnId;
            created.push(clone);
          }
        }
        return [...cs, ...created];
      });
      if (created.length)
        setSelectionState(new Set(created.map((c) => c.id)));
    },
    [mutateCards],
  );

  const bringToFront = React.useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids);
      mutateCards((cs) => {
        let z = nextZ(cs);
        return cs.map((c) => (wanted.has(c.id) ? { ...c, z: z++ } : c));
      });
    },
    [mutateCards],
  );

  const sendToBack = React.useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids);
      mutateCards((cs) => {
        let z = cs.reduce((m, c) => Math.min(m, c.z), 0) - ids.length;
        return cs.map((c) => (wanted.has(c.id) ? { ...c, z: z++ } : c));
      });
    },
    [mutateCards],
  );

  const dockCard = React.useCallback(
    (cardId: string, columnId: string, index: number) => {
      mutateCards((cs) =>
        cs.map((c) => {
          if (c.id === cardId) return { ...c, columnId } as BoardCard;
          if (c.type !== "column") return c;
          const children = c.children.filter((k) => k !== cardId);
          if (c.id === columnId)
            children.splice(Math.max(0, Math.min(index, children.length)), 0, cardId);
          return { ...c, children };
        }),
      );
    },
    [mutateCards],
  );

  const undockCard = React.useCallback(
    (cardId: string, x: number, y: number) => {
      mutateCards((cs) => {
        const z = nextZ(cs);
        return cs.map((c) => {
          if (c.id === cardId) {
            const { columnId, ...rest } = c;
            void columnId;
            return { ...rest, x, y, z } as BoardCard;
          }
          if (c.type === "column" && c.children.includes(cardId))
            return { ...c, children: c.children.filter((k) => k !== cardId) };
          return c;
        });
      });
    },
    [mutateCards],
  );

  /* ---- camera / meta ----------------------------------------------------- */

  const setCamera = React.useCallback(
    (cam: Camera) => {
      cameraRef.current = cam;
      setCameraState(cam);
      queueSave();
    },
    [queueSave],
  );

  const setSelection = React.useCallback((sel: Set<string>) => {
    setSelectionState(sel);
  }, []);

  const renameBoard = React.useCallback(
    (name: string) => {
      nameRef.current = name;
      setBoardName(name);
      setBoards((bs) =>
        bs.map((b) => (b.id === board.id ? { ...b, name } : b)),
      );
      queueSave();
    },
    [queueSave, board.id],
  );

  const refreshBoards = React.useCallback(async () => {
    try {
      setBoards(await client.listBoards());
    } catch {}
  }, [client]);

  const createBoard = React.useCallback(
    async (name: string, parent?: string) => {
      try {
        const created = await client.createBoard({
          name: name.trim() || "Untitled board",
          parent: parent ?? "",
        });
        await refreshBoards();
        return created.id;
      } catch {
        toast.error("Could not create board");
        return null;
      }
    },
    [client, refreshBoards],
  );

  const openDraw = React.useCallback((editId?: string) => {
    setSelectionState(new Set());
    setDrawMode({ editId });
  }, []);
  const closeDraw = React.useCallback(() => setDrawMode(null), []);

  // Delete this board: block any pending/future autosave first so a queued
  // save can't re-create the file after the DELETE.
  const deleteBoard = React.useCallback(async () => {
    deletedRef.current = true;
    dirtyRef.current = false;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await client.removeBoard(board.id);
  }, [client, board.id]);

  // Save on unload / tab hide.
  React.useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) saveNow(true);
    };
    window.addEventListener("beforeunload", flush);
    const vis = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [saveNow]);

  const value: BoardContextValue = {
    client,
    ws,
    boardId: board.id,
    wsTitle: info.title,
    wsColor: info.color,
    boardName,
    boards,
    cards,
    camera,
    selection,
    saveState,
    drawMode,
    openDraw,
    closeDraw,
    addCard,
    updateCard,
    updateCards,
    removeCards,
    duplicateCards,
    bringToFront,
    sendToBack,
    dockCard,
    undockCard,
    setCamera,
    setSelection,
    renameBoard,
    refreshBoards,
    createBoard,
    saveNow,
    deleteBoard,
  };

  return (
    <BoardContext.Provider value={value}>{children}</BoardContext.Provider>
  );
}

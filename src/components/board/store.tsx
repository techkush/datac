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

// Smart alignment guides shown while dragging (canvas coords, ephemeral).
export interface AlignGuides {
  v?: { x: number; y0: number; y1: number };
  h?: { y: number; x0: number; x1: number };
}

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
  // Alignment guides while dragging (never persisted, never queues a save).
  guides: AlignGuides | null;
  setGuides: (g: AlignGuides | null) => void;

  addCard: (card: Omit<BoardCard, "z">) => void;
  // true for the card added most recently — such cards mount in edit mode
  isFreshCard: (id: string) => boolean;
  updateCard: (id: string, patch: Partial<BoardCard>) => void;
  updateCards: (batch: Record<string, Partial<BoardCard>>) => void;
  removeCards: (ids: string[]) => void;
  duplicateCards: (ids: string[]) => void;
  copyCards: (ids: string[]) => void;
  cutCards: (ids: string[]) => void;
  pasteCards: () => void;
  hasClipboard: () => boolean;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
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

// Card clipboard for cut/copy/paste — module level so it survives across
// boards within the session (paste into another board works).
let cardClipboard: BoardCard[] = [];

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
  const [guides, setGuides] = React.useState<AlignGuides | null>(null);

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

  const lastAddedRef = React.useRef<string | null>(null);

  const addCard = React.useCallback(
    (card: Omit<BoardCard, "z">) => {
      lastAddedRef.current = card.id;
      mutateCards((cs) => [...cs, { ...card, z: nextZ(cs) } as BoardCard]);
      setSelectionState(new Set([card.id]));
    },
    [mutateCards],
  );

  const isFreshCard = React.useCallback(
    (id: string) => lastAddedRef.current === id,
    [],
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
      mutateCards((cs) => cs.filter((c) => !gone.has(c.id)));
      setSelectionState((sel) => {
        const next = new Set(sel);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    },
    [mutateCards],
  );

  // Clones are built OUTSIDE the state updater: updaters must stay pure —
  // StrictMode double-invokes them in dev, so any side effect (pushing to a
  // shared array, advancing the clipboard) would double the pasted cards.
  const duplicateCards = React.useCallback(
    (ids: string[]) => {
      const wanted = new Set(ids);
      let z = nextZ(cardsRef.current);
      const created: BoardCard[] = cardsRef.current
        .filter((c) => wanted.has(c.id))
        .map((c) => ({
          ...structuredClone(c),
          id: randomId(),
          x: c.x + 24,
          y: c.y + 24,
          z: z++,
        }));
      if (!created.length) return;
      mutateCards((cs) => [...cs, ...created]);
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

  /* ---- clipboard ---------------------------------------------------------- */

  const copyCards = React.useCallback((ids: string[]) => {
    const wanted = new Set(ids);
    cardClipboard = cardsRef.current
      .filter((c) => wanted.has(c.id))
      .map((c) => structuredClone(c));
  }, []);

  const cutCards = React.useCallback(
    (ids: string[]) => {
      copyCards(ids);
      removeCards(ids);
    },
    [copyCards, removeCards],
  );

  const pasteCards = React.useCallback(() => {
    if (!cardClipboard.length) return;
    let z = nextZ(cardsRef.current);
    const created: BoardCard[] = cardClipboard.map((c) => ({
      ...structuredClone(c),
      id: randomId(),
      x: c.x + 24,
      y: c.y + 24,
      z: z++,
    }));
    mutateCards((cs) => [...cs, ...created]);
    // repeated pastes land in a cascade instead of stacking exactly
    cardClipboard = cardClipboard.map((c) => ({ ...c, x: c.x + 24, y: c.y + 24 }));
    setSelectionState(new Set(created.map((c) => c.id)));
  }, [mutateCards]);

  const hasClipboard = React.useCallback(() => cardClipboard.length > 0, []);

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
    guides,
    setGuides,
    addCard,
    isFreshCard,
    updateCard,
    updateCards,
    removeCards,
    duplicateCards,
    copyCards,
    cutCards,
    pasteCards,
    hasClipboard,
    bringToFront,
    sendToBack,
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

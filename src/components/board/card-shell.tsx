"use client";

import * as React from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { WORKSPACE_COLORS } from "@/lib/datac/colors";
import { CardEditingContext } from "./card-edit-context";
import { cn } from "@/lib/utils";
import { useBoard } from "./store";
import { boardOverlayOpen, usePointerDrag } from "./use-drag";
import type { BoardCard, BoardCardType } from "@/lib/datac/board-types";
import { NoteCardView } from "./cards/note-card";
import { LinkCardView } from "./cards/link-card";
import { TodoCardView } from "./cards/todo-card";
import { ImageCardView, ImageMenuItems } from "./cards/image-card";
import { BoardCardView } from "./cards/board-card";
import { ColumnCardView } from "./cards/column-card";
import { TableCardView } from "./cards/table-card";
import { SketchCardView } from "./cards/sketch-card";
import { ColorCardView, ColorMenuItems } from "./cards/color-card";
import { HeadingCardView, HeadingMenuItems } from "./cards/heading-card";
import { PageCardView, PageMenuItems } from "./cards/page-card";

// How each card type resizes: fixed-height types resize freely, auto-height
// types only by width, images keep their aspect ratio.
type ResizeMode = "width" | "both" | "aspect";
const RESIZE: Record<BoardCardType, ResizeMode> = {
  note: "width",
  todo: "width",
  link: "width",
  board: "width",
  column: "width",
  table: "width",
  image: "aspect",
  sketch: "both",
  color: "both",
  heading: "width",
  page: "width",
};

const MIN_W = 140;
const MIN_H = 100;

// Types whose double-click enters edit mode (media types open instead).
const EDITABLE_TYPES = new Set([
  "note",
  "todo",
  "link",
  "table",
  "color",
  "column",
  "heading",
]);

// Elements that must receive the pointer instead of starting a card drag.
const NO_DRAG =
  'input, textarea, button, a, select, [contenteditable="true"], [data-no-drag]';

export function CardContent({ card }: { card: BoardCard }) {
  switch (card.type) {
    case "note":
      return <NoteCardView card={card} />;
    case "link":
      return <LinkCardView card={card} />;
    case "todo":
      return <TodoCardView card={card} />;
    case "image":
      return <ImageCardView card={card} />;
    case "board":
      return <BoardCardView card={card} />;
    case "column":
      return <ColumnCardView card={card} />;
    case "table":
      return <TableCardView card={card} />;
    case "sketch":
      return <SketchCardView card={card} />;
    case "color":
      return <ColorCardView card={card} />;
    case "heading":
      return <HeadingCardView card={card} />;
    case "page":
      return <PageCardView card={card} />;
  }
}

export function CardShell({ card }: { card: BoardCard }) {
  const {
    cards,
    camera,
    selection,
    setSelection,
    updateCards,
    updateCard,
    bringToFront,
    sendToBack,
    duplicateCards,
    removeCards,
    copyCards,
    cutCards,
    pasteCards,
    hasClipboard,
    isFreshCard,
    setGuides,
  } = useBoard();
  const selected = selection.has(card.id);
  // Context-menu actions apply to the whole selection when the card is in
  // it, otherwise just to this card.
  const targetIds = () =>
    selection.has(card.id) ? [...selection] : [card.id];

  // Refs so drag closures always see current values.
  const cardsRef = React.useRef(cards);
  cardsRef.current = cards;
  const zoomRef = React.useRef(camera.zoom);
  zoomRef.current = camera.zoom;
  const selectionRef = React.useRef(selection);
  selectionRef.current = selection;

  /* ---- edit mode ----------------------------------------------------------
   * Content is inert until the card is double-clicked, so single presses
   * anywhere (including over inputs) drag the card. Freshly added cards
   * start editing so you can type straight away. Deselecting exits. */
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const openRef = React.useRef<(() => void) | null>(null);
  const [editing, setEditing] = React.useState(() => isFreshCard(card.id));
  const editCtx = React.useMemo(
    () => ({ editing, setEditing, openRef }),
    [editing],
  );

  React.useEffect(() => {
    if (!selected && editing) setEditing(false);
  }, [selected, editing]);

  const onShellDoubleClick = () => {
    if (EDITABLE_TYPES.has(card.type) && !editing) {
      // ensure the card is selected — editing exits on deselect
      if (!selectionRef.current.has(card.id))
        setSelection(new Set([card.id]));
      setEditing(true);
      // focus the first control once it's interactive
      requestAnimationFrame(() =>
        shellRef.current
          ?.querySelector<HTMLElement>(
            'input, textarea, [contenteditable="true"]',
          )
          ?.focus(),
      );
    }
    openRef.current?.();
  };

  // While not editing, gate the content (media cards gate always — their
  // double-click opens something instead of an edit mode).
  const gated = EDITABLE_TYPES.has(card.type)
    ? !editing
    : (card.type === "image" && !!card.src) ||
      (card.type === "board" && !!card.boardId) ||
      (card.type === "page" && !!card.pageId);

  /* ---- move -------------------------------------------------------------- */
  const startPos = React.useRef(new Map<string, { x: number; y: number }>());
  const pressedInSelection = React.useRef(false);

  /* ---- smart alignment ----------------------------------------------------
   * While dragging, the pressed card's edges and centers snap to neighbor
   * edges/centers within a small tolerance; guide lines render in canvas. */
  interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
  }
  const neighborsRef = React.useRef<Box[]>([]);
  const dragSizeRef = React.useRef({ w: card.w, h: 0 });

  const snapshotNeighbors = (sel: Set<string>) => {
    const zoom = zoomRef.current;
    dragSizeRef.current = {
      w: card.w,
      h:
        card.h ??
        (shellRef.current?.getBoundingClientRect().height ?? 0) / zoom,
    };
    neighborsRef.current = cardsRef.current
      .filter((c) => !sel.has(c.id))
      .map((c) => {
        const el = document.querySelector(
          `[data-card-id="${CSS.escape(c.id)}"]`,
        );
        const h =
          c.h ?? (el ? el.getBoundingClientRect().height / zoom : 0);
        return { x: c.x, y: c.y, w: c.w, h };
      });
  };

  // Snap (nx, ny) against the neighbor boxes; returns the adjusted position
  // and the guide lines to show.
  const applySnap = (nx: number, ny: number) => {
    const { w, h } = dragSizeRef.current;
    const tol = 5 / zoomRef.current;
    let bestV: { d: number; x: number; n: Box } | null = null;
    let bestH: { d: number; y: number; n: Box } | null = null;
    for (const n of neighborsRef.current) {
      for (const t of [n.x, n.x + n.w / 2, n.x + n.w])
        for (const c of [nx, nx + w / 2, nx + w]) {
          const d = t - c;
          if (Math.abs(d) <= tol && (!bestV || Math.abs(d) < Math.abs(bestV.d)))
            bestV = { d, x: t, n };
        }
      for (const t of [n.y, n.y + n.h / 2, n.y + n.h])
        for (const c of [ny, ny + h / 2, ny + h]) {
          const d = t - c;
          if (Math.abs(d) <= tol && (!bestH || Math.abs(d) < Math.abs(bestH.d)))
            bestH = { d, y: t, n };
        }
    }
    const sx = nx + (bestV?.d ?? 0);
    const sy = ny + (bestH?.d ?? 0);
    setGuides(
      bestV || bestH
        ? {
            ...(bestV
              ? {
                  v: {
                    x: bestV.x,
                    y0: Math.min(sy, bestV.n.y),
                    y1: Math.max(sy + h, bestV.n.y + bestV.n.h),
                  },
                }
              : {}),
            ...(bestH
              ? {
                  h: {
                    y: bestH.y,
                    x0: Math.min(sx, bestH.n.x),
                    x1: Math.max(sx + w, bestH.n.x + bestH.n.w),
                  },
                }
              : {}),
          }
        : null,
    );
    return { dx: bestV?.d ?? 0, dy: bestH?.d ?? 0 };
  };

  const onDragDown = usePointerDrag({
    onStart: (e) => {
      if (boardOverlayOpen()) return false; // reading panel / lightbox up
      if ((e.target as HTMLElement).closest(NO_DRAG)) return false;
      pressedInSelection.current = selectionRef.current.has(card.id);
      let sel: Set<string>;
      if (e.shiftKey) {
        sel = new Set(selectionRef.current);
        if (sel.has(card.id)) {
          sel.delete(card.id);
          setSelection(sel);
          return false; // deselected — don't drag
        }
        sel.add(card.id);
      } else {
        sel = pressedInSelection.current
          ? new Set(selectionRef.current)
          : new Set([card.id]);
      }
      setSelection(sel);
      bringToFront([...sel]);
      if (card.locked) return false; // selectable, but pinned in place
      // locked cards in a multi-selection stay put while the rest move
      startPos.current = new Map(
        cardsRef.current
          .filter((c) => sel.has(c.id) && !c.locked)
          .map((c) => [c.id, { x: c.x, y: c.y }]),
      );
      snapshotNeighbors(sel);
    },
    onMove: (_e, d) => {
      if (!d.moved) return;
      const ddx = d.dx / zoomRef.current;
      const ddy = d.dy / zoomRef.current;
      // snap using the pressed card, then shift the whole batch by the same
      // correction so a multi-selection moves as one rigid group
      const p0 = startPos.current.get(card.id);
      const snap = p0
        ? applySnap(Math.round(p0.x + ddx), Math.round(p0.y + ddy))
        : { dx: 0, dy: 0 };
      const batch: Record<string, { x: number; y: number }> = {};
      for (const [id, p] of startPos.current)
        batch[id] = {
          x: Math.round(p.x + ddx) + snap.dx,
          y: Math.round(p.y + ddy) + snap.dy,
        };
      updateCards(batch);
    },
    onEnd: (e, d) => {
      setGuides(null);
      // plain click on an already multi-selected card collapses to it
      if (!d.moved && !e.shiftKey && pressedInSelection.current)
        setSelection(new Set([card.id]));
    },
  });

  /* ---- resize ------------------------------------------------------------ */
  const startSize = React.useRef({ w: card.w, h: card.h ?? 0 });
  const axisRef = React.useRef<"e" | "s" | "se">("se");
  const mode = RESIZE[card.type];
  const aspect =
    card.type === "image" && card.natW && card.natH
      ? card.natW / card.natH
      : null;

  const onResizeDown = usePointerDrag({
    onStart: () => {
      if (boardOverlayOpen()) return false;
      startSize.current = { w: card.w, h: card.h ?? 0 };
    },
    onMove: (e, d) => {
      const axis = axisRef.current;
      const dw = d.dx / zoomRef.current;
      const dh = d.dy / zoomRef.current;
      let w = startSize.current.w;
      let h = startSize.current.h;
      if (axis !== "s") w = Math.max(MIN_W, Math.round(startSize.current.w + dw));
      if (axis !== "e") h = Math.max(MIN_H, Math.round(startSize.current.h + dh));
      if (mode === "aspect" && aspect && !e.shiftKey) {
        // corner drives width, height follows the image's natural ratio
        h = Math.round(w / aspect);
      }
      if (mode === "width") updateCard(card.id, { w });
      else updateCard(card.id, { w, h });
    },
  });

  const resizeHandle = (axis: "e" | "s" | "se") => (e: React.PointerEvent) => {
    e.stopPropagation();
    axisRef.current = axis;
    onResizeDown(e);
  };

  const tint = card.color
    ? { background: `color-mix(in oklab, ${card.color} 16%, var(--card))` }
    : undefined;

  // Transparent cards carry no chrome (background/border/shadow): sketches
  // sit over the board with only their strokes catching the pointer, and
  // headings read as free-standing text.
  const transparent = card.type === "sketch" || card.type === "heading";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-card-id={card.id}
          ref={shellRef}
          className={cn(
            "absolute rounded-md",
            !transparent && "bg-card text-card-foreground border shadow-xs",
            // sketches: only strokes catch the pointer (empty area is
            // click-through); headings stay a normal drag surface
            card.type === "sketch" && "pointer-events-none",
            // selection: thin near-black outline (flips light in dark mode)
            selected &&
              (transparent
                ? "ring-foreground/50 ring-1"
                : "ring-foreground ring-1"),
          )}
          style={{
            left: card.x,
            top: card.y,
            width: card.w,
            ...(card.h ? { height: card.h } : {}),
            zIndex: card.z,
            ...tint,
          }}
          onPointerDown={onDragDown}
          onDoubleClick={onShellDoubleClick}
          onContextMenu={(e) => {
            e.stopPropagation(); // keep the canvas menu closed
            if (!selectionRef.current.has(card.id))
              setSelection(new Set([card.id]));
          }}
        >
      <CardEditingContext.Provider value={editCtx}>
        {/* h-full so fixed-height cards (color, image, sketch) keep their
            content stretched despite the extra gating wrapper */}
        <div className={cn("h-full", gated && "pointer-events-none")}>
          <CardContent card={card} />
        </div>
      </CardEditingContext.Provider>

      {selected && !card.locked && (
        <>
          <div
            className="pointer-events-auto absolute top-0 -right-1 bottom-0 w-2 cursor-ew-resize"
            onPointerDown={resizeHandle("e")}
          />
          {(mode === "both" || mode === "aspect") && (
            <div
              className="pointer-events-auto absolute right-0 -bottom-1 left-0 h-2 cursor-ns-resize"
              onPointerDown={resizeHandle("s")}
            />
          )}
          <div
            className="bg-background border-foreground pointer-events-auto absolute -right-1 -bottom-1 size-2.5 cursor-nwse-resize border"
            onPointerDown={resizeHandle("se")}
          />
        </>
      )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => cutCards(targetIds())}>
          Cut
          <span className="text-muted-foreground ml-auto text-xs">⌘X</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => copyCards(targetIds())}>
          Copy
          <span className="text-muted-foreground ml-auto text-xs">⌘C</span>
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasClipboard()} onClick={pasteCards}>
          Paste
          <span className="text-muted-foreground ml-auto text-xs">⌘V</span>
        </ContextMenuItem>
        <ContextMenuItem onClick={() => duplicateCards(targetIds())}>
          Duplicate
          <span className="text-muted-foreground ml-auto text-xs">⌘D</span>
        </ContextMenuItem>
        {card.type === "image" && <ImageMenuItems card={card} />}
        {(card.type === "heading" ||
          card.type === "color" ||
          (card.type === "page" && !!card.pageId)) && (
          <ContextMenuSeparator />
        )}
        {card.type === "heading" && <HeadingMenuItems card={card} />}
        {card.type === "color" && <ColorMenuItems card={card} />}
        {card.type === "page" && card.pageId && <PageMenuItems card={card} />}
        <ContextMenuSeparator />
        <ContextMenuItem
          onClick={() =>
            updateCards(
              Object.fromEntries(
                targetIds().map((id) => [id, { locked: !card.locked }]),
              ),
            )
          }
        >
          Lock position
          {card.locked && <span className="ml-auto text-xs">✓</span>}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => bringToFront(targetIds())}>
          Bring to front
        </ContextMenuItem>
        <ContextMenuItem onClick={() => sendToBack(targetIds())}>
          Send to back
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>Color</ContextMenuSubTrigger>
          <ContextMenuSubContent className="w-36">
            <ContextMenuItem
              onClick={() =>
                updateCards(
                  Object.fromEntries(
                    targetIds().map((id) => [id, { color: undefined }]),
                  ),
                )
              }
            >
              <span className="bg-card size-3 rounded-full border" />
              None
            </ContextMenuItem>
            {WORKSPACE_COLORS.map((c) => (
              <ContextMenuItem
                key={c.value}
                onClick={() =>
                  updateCards(
                    Object.fromEntries(
                      targetIds().map((id) => [id, { color: c.value }]),
                    ),
                  )
                }
              >
                <span
                  className="size-3 rounded-full"
                  style={{ background: c.value }}
                />
                {c.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuItem
          variant="destructive"
          onClick={() => removeCards(targetIds())}
        >
          Delete
          <span className="text-muted-foreground ml-auto text-xs">⌫</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

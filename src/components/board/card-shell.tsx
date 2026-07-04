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
import { cn } from "@/lib/utils";
import { useBoard } from "./store";
import { usePointerDrag } from "./use-drag";
import type { BoardCard, BoardCardType } from "@/lib/datac/board-types";
import { NoteCardView } from "./cards/note-card";
import { LinkCardView } from "./cards/link-card";
import { TodoCardView } from "./cards/todo-card";
import { ImageCardView } from "./cards/image-card";
import { BoardCardView } from "./cards/board-card";
import { ColumnCardView } from "./cards/column-card";
import { TableCardView } from "./cards/table-card";
import { SketchCardView } from "./cards/sketch-card";
import { ColorCardView } from "./cards/color-card";

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
};

const MIN_W = 140;
const MIN_H = 100;

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
    dockCard,
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

  /* ---- move -------------------------------------------------------------- */
  const startPos = React.useRef(new Map<string, { x: number; y: number }>());
  const pressedInSelection = React.useRef(false);

  // Column drop targets: only single non-column cards can dock. Highlight is
  // applied straight to the DOM to avoid re-rendering columns per move.
  const hitColumn = (e: PointerEvent): HTMLElement | null => {
    if (card.type === "column" || startPos.current.size !== 1) return null;
    for (const el of document.querySelectorAll<HTMLElement>(
      "[data-column-drop]",
    )) {
      const r = el.getBoundingClientRect();
      if (
        e.clientX > r.left &&
        e.clientX < r.right &&
        e.clientY > r.top &&
        e.clientY < r.bottom
      )
        return el;
    }
    return null;
  };
  const clearDropHover = () =>
    document
      .querySelectorAll("[data-column-drop][data-drop-hover]")
      .forEach((el) => el.removeAttribute("data-drop-hover"));

  const onDragDown = usePointerDrag({
    onStart: (e) => {
      if ((e.target as HTMLElement).closest(NO_DRAG)) return false;
      // nested cards (inside a column) are handled by the column in phase 3
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
      startPos.current = new Map(
        cardsRef.current
          .filter((c) => sel.has(c.id) && !c.columnId)
          .map((c) => [c.id, { x: c.x, y: c.y }]),
      );
    },
    onMove: (e, d) => {
      if (!d.moved) return;
      const batch: Record<string, { x: number; y: number }> = {};
      for (const [id, p] of startPos.current)
        batch[id] = {
          x: Math.round(p.x + d.dx / zoomRef.current),
          y: Math.round(p.y + d.dy / zoomRef.current),
        };
      updateCards(batch);
      clearDropHover();
      hitColumn(e)?.setAttribute("data-drop-hover", "1");
    },
    onEnd: (e, d) => {
      clearDropHover();
      // plain click on an already multi-selected card collapses to it
      if (!d.moved && !e.shiftKey && pressedInSelection.current) {
        setSelection(new Set([card.id]));
        return;
      }
      if (!d.moved) return;
      const col = hitColumn(e);
      if (!col) return;
      // insertion index = docked siblings whose midpoint is above the pointer
      const index = [
        ...col.querySelectorAll<HTMLElement>("[data-docked-id]"),
      ].filter((el) => {
        const b = el.getBoundingClientRect();
        return b.top + b.height / 2 < e.clientY;
      }).length;
      dockCard(card.id, col.dataset.columnDrop!, index);
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

  // Sketches sit transparently over the board: no card chrome, and only
  // their strokes (plus the resize handles) catch the pointer.
  const transparent = card.type === "sketch";

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          data-card-id={card.id}
          className={cn(
            "absolute rounded-lg",
            transparent
              ? "pointer-events-none"
              : "bg-card text-card-foreground border shadow-sm",
            selected &&
              (transparent
                ? "ring-primary/40 ring-1"
                : "ring-primary/60 ring-2"),
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
          onContextMenu={(e) => {
            e.stopPropagation(); // keep the canvas menu closed
            if (!selectionRef.current.has(card.id))
              setSelection(new Set([card.id]));
          }}
        >
      <CardContent card={card} />

      {selected && (
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
            className="bg-primary pointer-events-auto absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-full border-2 border-white shadow dark:border-neutral-900"
            onPointerDown={resizeHandle("se")}
          />
        </>
      )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={() => duplicateCards(targetIds())}>
          Duplicate
          <span className="text-muted-foreground ml-auto text-xs">⌘D</span>
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

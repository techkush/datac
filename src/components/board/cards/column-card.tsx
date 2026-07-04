"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useBoard } from "../store";
import { usePointerDrag } from "../use-drag";
import { screenToCanvas } from "../coords";
import type { BoardCard, ColumnCard } from "@/lib/datac/board-types";
// CardContent lives in card-shell; the import cycle is fine because it is
// only resolved at render time.
import { CardContent } from "../card-shell";

// Pointer must leave the column rect by this much before a docked card
// undocks back onto the free canvas.
const UNDOCK_SLOP = 40;

export function ColumnCardView({ card }: { card: ColumnCard }) {
  const { cards, updateCard } = useBoard();
  const byId = React.useMemo(
    () => new Map(cards.map((c) => [c.id, c])),
    [cards],
  );
  const docked = card.children
    .map((id) => byId.get(id))
    .filter((c): c is BoardCard => !!c);

  return (
    <div className="flex flex-col">
      <input
        value={card.title}
        onChange={(e) => updateCard(card.id, { title: e.target.value })}
        placeholder="Column"
        aria-label="Column title"
        className="placeholder:text-muted-foreground bg-transparent px-3 pt-2.5 pb-1 text-sm font-semibold outline-none"
      />
      <div
        data-column-drop={card.id}
        className="mx-2 mb-2 flex min-h-16 flex-col gap-2 rounded-md p-1 transition-colors data-[drop-hover]:bg-primary/5 data-[drop-hover]:ring-2 data-[drop-hover]:ring-primary/40"
      >
        {docked.map((child) => (
          <DockedCard key={child.id} card={child} column={card} />
        ))}
        {!docked.length && (
          <p className="text-muted-foreground/70 border-muted-foreground/20 rounded-md border border-dashed px-2 py-4 text-center text-xs">
            Drag cards here
          </p>
        )}
      </div>
    </div>
  );
}

// A card living inside a column: rendered as a normal stacked block. Dragging
// reorders it within the column; pulling it out past UNDOCK_SLOP frees it
// back onto the canvas and the same gesture keeps moving it.
function DockedCard({ card, column }: { card: BoardCard; column: ColumnCard }) {
  const { camera, selection, setSelection, dockCard, undockCard, updateCard } =
    useBoard();
  const selected = selection.has(card.id);
  const cameraRef = React.useRef(camera);
  cameraRef.current = camera;
  // After mid-gesture undock the wrapper unmounts; the drag continues on
  // window listeners, tracking the freed card via this ref.
  const freed = React.useRef<{ id: string; w: number } | null>(null);

  const onDragDown = usePointerDrag({
    onStart: (e) => {
      if ((e.target as HTMLElement).closest(
        'input, textarea, button, a, select, [contenteditable="true"], [data-no-drag]',
      ))
        return false;
      e.stopPropagation(); // don't start the column's own drag
      freed.current = null;
      setSelection(new Set([card.id]));
    },
    onMove: (e, d) => {
      if (!d.moved) return;
      const vp = document.querySelector("[data-board-viewport]");
      const vpRect = vp?.getBoundingClientRect();
      if (!vpRect) return;
      const toCanvas = () =>
        screenToCanvas(
          { x: e.clientX - vpRect.left, y: e.clientY - vpRect.top },
          cameraRef.current,
        );

      if (freed.current) {
        // already undocked — keep moving the free card under the pointer
        const p = toCanvas();
        updateCard(freed.current.id, {
          x: Math.round(p.x - freed.current.w / 2),
          y: Math.round(p.y - 14),
        });
        return;
      }

      const body = document.querySelector(
        `[data-column-drop="${column.id}"]`,
      );
      const rect = body?.getBoundingClientRect();
      if (!rect) return;
      const inside =
        e.clientX > rect.left - UNDOCK_SLOP &&
        e.clientX < rect.right + UNDOCK_SLOP &&
        e.clientY > rect.top - UNDOCK_SLOP &&
        e.clientY < rect.bottom + UNDOCK_SLOP;

      if (inside) {
        // reorder: index = docked siblings above the pointer
        const wrappers = [
          ...body!.querySelectorAll<HTMLElement>("[data-docked-id]"),
        ].filter((el) => el.dataset.dockedId !== card.id);
        const index = wrappers.filter((el) => {
          const b = el.getBoundingClientRect();
          return b.top + b.height / 2 < e.clientY;
        }).length;
        const current = column.children.indexOf(card.id);
        if (index !== current) dockCard(card.id, column.id, index);
      } else {
        const p = toCanvas();
        freed.current = { id: card.id, w: card.w };
        undockCard(card.id, Math.round(p.x - card.w / 2), Math.round(p.y - 14));
      }
    },
  });

  return (
    <div
      data-docked-id={card.id}
      data-card-id={card.id}
      className={cn(
        "bg-card text-card-foreground rounded-md border shadow-xs",
        selected && "ring-primary/60 ring-2",
      )}
      style={
        card.color
          ? {
              background: `color-mix(in oklab, ${card.color} 16%, var(--card))`,
            }
          : undefined
      }
      onPointerDown={onDragDown}
    >
      <CardContent card={card} />
    </div>
  );
}

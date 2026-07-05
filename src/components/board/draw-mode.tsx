"use client";

import * as React from "react";
import { randomId } from "@/lib/datac/constants";
import type { SketchCard, SketchStroke } from "@/lib/datac/board-types";
import { useBoard } from "./store";
import { screenToCanvas } from "./coords";
import { strokePath } from "./cards/sketch-card";
import {
  SketchToolbar,
  strokesBBox,
  useSketchSession,
  type Pt,
} from "./sketch-session";
import { cn } from "@/lib/utils";

// Full-screen drawing over the board (canvas coordinates). Saving crops the
// strokes to their bounding box and lands them as a transparent sketch card.
export function DrawMode() {
  const { cards, camera, drawMode, closeDraw, addCard, updateCard } = useBoard();
  const editCard = drawMode?.editId
    ? (cards.find((c) => c.id === drawMode.editId && c.type === "sketch") as
        | SketchCard
        | undefined)
    : undefined;

  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const cameraRef = React.useRef(camera);
  cameraRef.current = camera;

  // Existing strokes (edit mode) mapped from card-local to canvas coords,
  // un-scaling any resize that happened since the drawing was saved.
  const [initial] = React.useState<SketchStroke[]>(() => {
    if (!editCard) return [];
    const sx = editCard.viewW ? editCard.w / editCard.viewW : 1;
    const sy = editCard.viewH && editCard.h ? editCard.h / editCard.viewH : 1;
    return editCard.strokes.map((s) => ({
      ...s,
      width: s.width * ((sx + sy) / 2),
      points: s.points.map(([x, y]): Pt => [
        editCard.x + x * sx,
        editCard.y + y * sy,
      ]),
    }));
  });

  const s = useSketchSession({
    initial,
    toLocal: (e) => {
      const r = overlayRef.current!.getBoundingClientRect();
      const p = screenToCanvas(
        { x: e.clientX - r.left, y: e.clientY - r.top },
        cameraRef.current,
      );
      return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
    },
    getScale: () => cameraRef.current.zoom,
  });

  function save() {
    const all = s.strokesRef.current;
    if (!all.length) {
      closeDraw();
      return;
    }
    const { minX, minY, maxX, maxY, maxW } = strokesBBox(all);
    const pad = maxW / 2 + 8;
    const x = Math.floor(minX - pad);
    const y = Math.floor(minY - pad);
    const w = Math.ceil(maxX - minX + pad * 2);
    const h = Math.ceil(maxY - minY + pad * 2);
    const local = all.map((st) => ({
      ...st,
      points: st.points.map(([px, py]): Pt => [
        Math.round((px - x) * 10) / 10,
        Math.round((py - y) * 10) / 10,
      ]),
    }));
    const fields = { x, y, w, h, strokes: local, viewW: w, viewH: h };
    if (editCard) updateCard(editCard.id, fields);
    else
      addCard({ id: randomId(), type: "sketch", ...fields } as Omit<
        SketchCard,
        "z"
      >);
    closeDraw();
  }

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        // let an open color/size popover consume Escape before the session
        if (document.querySelector("[data-radix-popper-content-wrapper]"))
          return;
        closeDraw();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        s.deleteSelected();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "z" && e.shiftKey) {
        s.redo();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "z") {
        s.undo();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [closeDraw, s.undo, s.redo, s.deleteSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  const cam = camera;

  return (
    <div
      ref={overlayRef}
      className={cn(
        "absolute inset-0 z-40 bg-white/40 dark:bg-black/40",
        s.tool === "pen" && "cursor-crosshair",
        s.tool === "eraser" && "cursor-cell",
      )}
      style={{ touchAction: "none" }}
      onPointerDown={s.onPointerDown}
    >
      <svg className="pointer-events-none h-full w-full">
        <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.zoom})`}>
          {s.strokes.map((st, i) => (
            <path
              key={i}
              d={strokePath(st.points)}
              stroke={st.color}
              strokeWidth={st.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {/* in-progress stroke, updated imperatively; width divided by zoom
              so it matches the committed stroke's on-screen thickness */}
          <path
            ref={s.livePathRef}
            stroke={s.color}
            strokeWidth={s.size / cam.zoom}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {s.selBox && s.tool === "cursor" && (
            <rect
              x={s.selBox.minX - 6}
              y={s.selBox.minY - 6}
              width={s.selBox.maxX - s.selBox.minX + 12}
              height={s.selBox.maxY - s.selBox.minY + 12}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5 / cam.zoom}
              strokeDasharray={`${4 / cam.zoom} ${4 / cam.zoom}`}
            />
          )}
        </g>
      </svg>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <SketchToolbar s={s} onDiscard={closeDraw} onSave={save} />
      </div>
    </div>
  );
}

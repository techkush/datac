"use client";

import * as React from "react";
import type { SketchCard } from "@/lib/datac/board-types";
import { useBoard } from "../store";

// Quadratic-midpoint smoothing: M p0 … Q pi mid(pi, pi+1) …
export function strokePath(points: [number, number][]): string {
  if (!points.length) return "";
  if (points.length < 3)
    return `M ${points[0][0]} ${points[0][1]} L ${points[points.length - 1][0]} ${points[points.length - 1][1]}`;
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i][0] + points[i + 1][0]) / 2;
    const my = (points[i][1] + points[i + 1][1]) / 2;
    d += ` Q ${points[i][0]} ${points[i][1]} ${mx} ${my}`;
  }
  return d;
}

// A saved drawing: a transparent overlay on the board. Strokes are the only
// clickable area (empty space passes through to cards underneath); editing
// happens in the full-screen draw mode — double-click a stroke to reopen it.
export function SketchCardView({ card }: { card: SketchCard }) {
  const { openDraw } = useBoard();
  return (
    <svg
      className="pointer-events-none block h-full w-full"
      // viewBox scales the drawing with card resizes; legacy cards without
      // a saved natural size render 1:1
      viewBox={
        card.viewW && card.viewH
          ? `0 0 ${card.viewW} ${card.viewH}`
          : undefined
      }
      preserveAspectRatio="none"
      role="img"
      aria-label="Drawing"
      onDoubleClick={() => openDraw(card.id)}
    >
      {card.strokes.map((s, i) => (
        <g key={i}>
          <path
            d={strokePath(s.points)}
            stroke={s.color}
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {/* invisible fat twin: a comfortable pointer target so the card
              can be selected/dragged by its strokes (empty space stays
              click-through) */}
          <path
            d={strokePath(s.points)}
            stroke="transparent"
            strokeWidth={Math.max(s.width, 14)}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            pointerEvents="stroke"
          />
        </g>
      ))}
    </svg>
  );
}

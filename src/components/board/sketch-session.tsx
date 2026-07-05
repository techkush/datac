"use client";

import * as React from "react";
import {
  Eraser,
  MousePointer2,
  Pencil,
  Redo2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { SketchStroke } from "@/lib/datac/board-types";
import { strokePath } from "./cards/sketch-card";
import { cn } from "@/lib/utils";

/* ---- palette ------------------------------------------------------------- */
// The 12 basic pen colors (matching the Milanote-style picker rows).
export const BASIC_COLORS = [
  "#334155", "#9CA3AF", "#2DD4BF", "#4ADE80", "#B45309", "#FACC15",
  "#FB923C", "#EF4444", "#EC4899", "#A855F7", "#38BDF8", "#4F46E5",
];
export const PEN_SIZES = [2, 4, 7, 12];
const RECENT_KEY = "datac-draw-recent-colors";

const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(v) ? v.slice(0, 10) : [];
  } catch {
    return [];
  }
};

/* ---- geometry ------------------------------------------------------------ */
export type Pt = [number, number];

const distToSegment = (p: Pt, a: Pt, b: Pt): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
    : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
};

const strokeHit = (s: SketchStroke, p: Pt, slop: number): boolean => {
  const r = s.width / 2 + slop;
  if (s.points.length === 1)
    return Math.hypot(p[0] - s.points[0][0], p[1] - s.points[0][1]) <= r;
  for (let i = 0; i < s.points.length - 1; i++)
    if (distToSegment(p, s.points[i], s.points[i + 1]) <= r) return true;
  return false;
};

export const strokesBBox = (strokes: SketchStroke[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, maxW = 0;
  for (const s of strokes) {
    maxW = Math.max(maxW, s.width);
    for (const [x, y] of s.points) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY, maxW };
};

/* ---- session -------------------------------------------------------------- */
// One drawing session over an arbitrary local coordinate space. Consumers
// provide toLocal (pointer → local coords) and getScale (screen px per local
// unit); the session owns tools, strokes, history and the pointer handler.
export type SketchTool = "pen" | "cursor" | "eraser";

export function useSketchSession({
  initial,
  toLocal,
  getScale,
}: {
  initial: SketchStroke[];
  toLocal: (e: { clientX: number; clientY: number }) => Pt;
  getScale: () => number;
}) {
  const [strokes, setStrokes] = React.useState<SketchStroke[]>(initial);
  const past = React.useRef<SketchStroke[][]>([]);
  const future = React.useRef<SketchStroke[][]>([]);
  const [, bumpHistory] = React.useReducer((n: number) => n + 1, 0);

  const [tool, setTool] = React.useState<SketchTool>("pen");
  const [color, setColor] = React.useState(BASIC_COLORS[6]); // orange
  const [size, setSize] = React.useState(PEN_SIZES[1]);
  const [recent, setRecent] = React.useState<string[]>(readRecent);
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);

  const livePathRef = React.useRef<SVGPathElement | null>(null);
  const strokesRef = React.useRef(strokes);
  strokesRef.current = strokes;
  const selectedIdxRef = React.useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;
  const io = React.useRef({ toLocal, getScale });
  io.current = { toLocal, getScale };

  const commit = React.useCallback((next: SketchStroke[]) => {
    past.current.push(strokesRef.current);
    future.current = [];
    setStrokes(next);
    bumpHistory();
  }, []);

  const undo = React.useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(strokesRef.current);
    setStrokes(prev);
    setSelectedIdx(null);
    bumpHistory();
  }, []);

  const redo = React.useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(strokesRef.current);
    setStrokes(next);
    setSelectedIdx(null);
    bumpHistory();
  }, []);

  // Delete the stroke selected with the cursor tool (Backspace/Delete).
  const deleteSelected = React.useCallback(() => {
    const idx = selectedIdxRef.current;
    if (idx === null || !strokesRef.current[idx]) return;
    commit(strokesRef.current.filter((_, i) => i !== idx));
    setSelectedIdx(null);
  }, [commit]);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-draw-ui]")) return;
    const { toLocal, getScale } = io.current;
    const id = e.pointerId;
    const start = toLocal(e);
    const scale = getScale();
    const slop = 6 / scale;

    if (tool === "pen") {
      const pts: Pt[] = [start];
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        const evs = "getCoalescedEvents" in ev ? ev.getCoalescedEvents() : [ev];
        for (const ce of evs.length ? evs : [ev]) pts.push(toLocal(ce));
        livePathRef.current?.setAttribute("d", strokePath(pts));
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        livePathRef.current?.setAttribute("d", "");
        // width in local units so on-screen thickness matches the picked size
        commit([
          ...strokesRef.current,
          { color, width: size / scale, points: pts },
        ]);
      };
      attach(onMove, onUp);
    } else if (tool === "eraser") {
      let snapshotTaken = false;
      const eraseAt = (p: Pt) => {
        const left = strokesRef.current.filter((s) => !strokeHit(s, p, slop));
        if (left.length !== strokesRef.current.length) {
          if (!snapshotTaken) {
            past.current.push(strokesRef.current);
            future.current = [];
            snapshotTaken = true;
            bumpHistory();
          }
          strokesRef.current = left;
          setStrokes(left);
        }
      };
      eraseAt(start);
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId === id) eraseAt(toLocal(ev));
      };
      attach(onMove, () => {});
    } else {
      // cursor: pick the topmost stroke under the pointer, drag to move it
      const idx = [...strokesRef.current]
        .map((s, i) => ({ s, i }))
        .reverse()
        .find(({ s }) => strokeHit(s, start, slop))?.i;
      setSelectedIdx(idx ?? null);
      if (idx === undefined) return;
      const orig = strokesRef.current[idx];
      let moved = false;
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        const p = toLocal(ev);
        const dx = p[0] - start[0];
        const dy = p[1] - start[1];
        if (!moved && Math.hypot(dx, dy) > 2 / scale) {
          moved = true;
          past.current.push(strokesRef.current);
          future.current = [];
          bumpHistory();
        }
        if (!moved) return;
        const next = strokesRef.current.slice();
        next[idx] = {
          ...orig,
          points: orig.points.map(([x, y]): Pt => [x + dx, y + dy]),
        };
        strokesRef.current = next;
        setStrokes(next);
      };
      attach(onMove, () => {});
    }

    // Track the gesture on window; auto-detach on pointerup/cancel.
    function attach(
      onMove: (ev: PointerEvent) => void,
      onUp: (ev: PointerEvent) => void,
    ) {
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        onUp(ev);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    }
  }

  const pickColor = (c: string) => {
    setColor(c);
    setTool("pen");
  };
  const pickCustom = (c: string) => {
    pickColor(c);
    setRecent((r) => {
      const next = [c, ...r.filter((x) => x !== c)].slice(0, 10);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const selBox =
    selectedIdx !== null && strokes[selectedIdx]
      ? strokesBBox([strokes[selectedIdx]])
      : null;

  return {
    strokes,
    strokesRef,
    tool,
    setTool,
    color,
    size,
    setSize,
    recent,
    pickColor,
    pickCustom,
    selBox,
    setSelectedIdx,
    livePathRef,
    onPointerDown,
    undo,
    redo,
    deleteSelected,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

export type SketchSession = ReturnType<typeof useSketchSession>;

/* ---- toolbar --------------------------------------------------------------- */
export function SketchToolbar({
  s,
  onDiscard,
  onSave,
}: {
  s: SketchSession;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div
      data-draw-ui
      className="bg-background flex items-center gap-1 rounded-xl border p-1.5 shadow-lg"
    >
      <ToolButton active={s.tool === "pen"} label="Pen" onClick={() => s.setTool("pen")}>
        <Pencil className="size-4" />
      </ToolButton>
      <ToolButton
        active={s.tool === "cursor"}
        label="Select and move strokes"
        onClick={() => s.setTool("cursor")}
      >
        <MousePointer2 className="size-4" />
      </ToolButton>
      <ToolButton
        active={s.tool === "eraser"}
        label="Eraser"
        onClick={() => {
          s.setTool("eraser");
          s.setSelectedIdx(null);
        }}
      >
        <Eraser className="size-4" />
      </ToolButton>

      <span className="bg-border mx-1 h-5 w-px" />

      {/* color picker */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Pen color">
            <span className="size-4.5 rounded" style={{ background: s.color }} />
          </Button>
        </PopoverTrigger>
        {/* z above the image lightbox (z-100), which portals to body too */}
        <PopoverContent side="top" align="center" className="z-[120] w-48 p-2" data-draw-ui>
          <div className="grid grid-cols-6 gap-1.5">
            {BASIC_COLORS.map((c) => (
              <ColorSwatch key={c} color={c} current={s.color} onPick={s.pickColor} />
            ))}
          </div>
          {s.recent.length > 0 && (
            <>
              <div className="text-muted-foreground mt-2 mb-1 text-[10px] font-medium tracking-wide uppercase">
                Recent
              </div>
              <div className="grid grid-cols-6 gap-1.5">
                {s.recent.map((c) => (
                  <ColorSwatch key={c} color={c} current={s.color} onPick={s.pickColor} />
                ))}
              </div>
            </>
          )}
          <label className="border-input hover:bg-accent mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-1 text-xs">
            <span
              className="size-3.5 rounded-full"
              style={{
                background:
                  "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
              }}
            />
            Custom color…
            <input
              type="color"
              value={s.color}
              className="size-0 opacity-0"
              onChange={(e) => s.pickCustom(e.target.value.toUpperCase())}
            />
          </label>
        </PopoverContent>
      </Popover>

      {/* pen size */}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label="Pen size">
            <span
              className="bg-foreground rounded-full"
              style={{
                width: Math.min(s.size + 2, 16),
                height: Math.min(s.size + 2, 16),
              }}
            />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" className="z-[120] w-auto p-1.5" data-draw-ui>
          <div className="flex items-center gap-1">
            {PEN_SIZES.map((sz) => (
              <button
                key={sz}
                aria-label={`Pen size ${sz}`}
                className={cn(
                  "hover:bg-accent flex size-9 items-center justify-center rounded-md border border-transparent",
                  s.size === sz && "border-foreground",
                )}
                onClick={() => {
                  s.setSize(sz);
                  s.setTool("pen");
                }}
              >
                <span
                  className="bg-foreground rounded-full"
                  style={{ width: sz + 3, height: sz + 3 }}
                />
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <span className="bg-border mx-1 h-5 w-px" />

      <ToolButton label="Undo" onClick={s.undo} disabled={!s.canUndo}>
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton label="Redo" onClick={s.redo} disabled={!s.canRedo}>
        <Redo2 className="size-4" />
      </ToolButton>

      <span className="bg-border mx-1 h-5 w-px" />

      <Button variant="outline" size="sm" className="h-8" onClick={onDiscard}>
        Discard
      </Button>
      <Button size="sm" className="h-8" onClick={onSave}>
        Save
      </Button>
    </div>
  );
}

function ToolButton({
  active,
  label,
  onClick,
  disabled,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="icon"
      className={cn("size-8", active && "border-foreground/30 border")}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ColorSwatch({
  color,
  current,
  onPick,
}: {
  color: string;
  current: string;
  onPick: (c: string) => void;
}) {
  return (
    <button
      aria-label={`Color ${color}`}
      className={cn(
        "size-6 rounded-md border border-black/10",
        current === color && "ring-foreground ring-2 ring-offset-1",
      )}
      style={{ background: color }}
      onClick={() => onPick(color)}
    />
  );
}

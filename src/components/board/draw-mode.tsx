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
import { randomId } from "@/lib/datac/constants";
import type { SketchCard, SketchStroke } from "@/lib/datac/board-types";
import { useBoard } from "./store";
import { screenToCanvas } from "./coords";
import { strokePath } from "./cards/sketch-card";
import { cn } from "@/lib/utils";

/* ---- palette ------------------------------------------------------------- */
// The 12 basic pen colors (matching the Milanote-style picker rows).
const BASIC_COLORS = [
  "#334155", "#9CA3AF", "#2DD4BF", "#4ADE80", "#B45309", "#FACC15",
  "#FB923C", "#EF4444", "#EC4899", "#A855F7", "#38BDF8", "#4F46E5",
];
const PEN_SIZES = [2, 4, 7, 12];
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
type Pt = [number, number];

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
  if (s.points.length === 1) return Math.hypot(p[0] - s.points[0][0], p[1] - s.points[0][1]) <= r;
  for (let i = 0; i < s.points.length - 1; i++)
    if (distToSegment(p, s.points[i], s.points[i + 1]) <= r) return true;
  return false;
};

const strokesBBox = (strokes: SketchStroke[]) => {
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

/* ---- component ------------------------------------------------------------ */
type Tool = "pen" | "cursor" | "eraser";

export function DrawMode() {
  const { cards, camera, drawMode, closeDraw, addCard, updateCard } = useBoard();
  const editCard = drawMode?.editId
    ? (cards.find((c) => c.id === drawMode.editId && c.type === "sketch") as
        | SketchCard
        | undefined)
    : undefined;

  // Existing strokes (edit mode) mapped from card-local to canvas coords,
  // un-scaling any resize that happened since the drawing was saved.
  const [strokes, setStrokes] = React.useState<SketchStroke[]>(() => {
    if (!editCard) return [];
    const sx = editCard.viewW ? editCard.w / editCard.viewW : 1;
    const sy = editCard.viewH && editCard.h ? editCard.h / editCard.viewH : 1;
    return editCard.strokes.map((s) => ({
      ...s,
      width: s.width * ((sx + sy) / 2),
      points: s.points.map(([x, y]): Pt => [editCard.x + x * sx, editCard.y + y * sy]),
    }));
  });
  const past = React.useRef<SketchStroke[][]>([]);
  const future = React.useRef<SketchStroke[][]>([]);
  const [, bumpHistory] = React.useReducer((n: number) => n + 1, 0);

  const [tool, setTool] = React.useState<Tool>("pen");
  const [color, setColor] = React.useState(BASIC_COLORS[6]); // orange
  const [size, setSize] = React.useState(PEN_SIZES[1]);
  const [recent, setRecent] = React.useState<string[]>(readRecent);
  const [selectedIdx, setSelectedIdx] = React.useState<number | null>(null);

  const overlayRef = React.useRef<HTMLDivElement | null>(null);
  const livePathRef = React.useRef<SVGPathElement | null>(null);
  const strokesRef = React.useRef(strokes);
  strokesRef.current = strokes;
  const cameraRef = React.useRef(camera);
  cameraRef.current = camera;

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

  const toCanvas = (e: { clientX: number; clientY: number }): Pt => {
    const r = overlayRef.current!.getBoundingClientRect();
    const p = screenToCanvas(
      { x: e.clientX - r.left, y: e.clientY - r.top },
      cameraRef.current,
    );
    return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
  };

  /* ---- pointer handling per tool ---------------------------------------- */
  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-draw-ui]")) return;
    const id = e.pointerId;
    const start = toCanvas(e);
    const zoom = cameraRef.current.zoom;
    const slop = 6 / zoom;

    if (tool === "pen") {
      const pts: Pt[] = [start];
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        const evs = "getCoalescedEvents" in ev ? ev.getCoalescedEvents() : [ev];
        for (const ce of evs.length ? evs : [ev]) pts.push(toCanvas(ce));
        livePathRef.current?.setAttribute("d", strokePath(pts));
      };
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== id) return;
        livePathRef.current?.setAttribute("d", "");
        // width in canvas units so the on-screen thickness matches the
        // picked size at the zoom the user drew at
        commit([
          ...strokesRef.current,
          { color, width: size / zoom, points: pts },
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
        if (ev.pointerId === id) eraseAt(toCanvas(ev));
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
        const p = toCanvas(ev);
        const dx = p[0] - start[0];
        const dy = p[1] - start[1];
        if (!moved && Math.hypot(dx, dy) > 2 / zoom) {
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

  /* ---- save / discard ----------------------------------------------------- */
  function save() {
    const all = strokesRef.current;
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
    const local = all.map((s) => ({
      ...s,
      points: s.points.map(([px, py]): Pt => [
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

  /* ---- keyboard ----------------------------------------------------------- */
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        // let an open color/size popover consume Escape before the session
        if (document.querySelector("[data-radix-popper-content-wrapper]"))
          return;
        closeDraw();
      } else if (mod && e.key.toLowerCase() === "z" && e.shiftKey) {
        redo();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "z") {
        undo();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [closeDraw, undo, redo]);

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

  const cam = camera;
  const selBox =
    selectedIdx !== null && strokes[selectedIdx]
      ? strokesBBox([strokes[selectedIdx]])
      : null;

  return (
    <div
      ref={overlayRef}
      className={cn(
        "absolute inset-0 z-40 bg-white/40 dark:bg-black/40",
        tool === "pen" && "cursor-crosshair",
        tool === "eraser" && "cursor-cell",
      )}
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
    >
      <svg className="pointer-events-none h-full w-full">
        <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.zoom})`}>
          {strokes.map((s, i) => (
            <path
              key={i}
              d={strokePath(s.points)}
              stroke={s.color}
              strokeWidth={s.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          {/* in-progress stroke, updated imperatively; width divided by zoom
              so it matches the committed stroke's on-screen thickness */}
          <path
            ref={livePathRef}
            stroke={color}
            strokeWidth={size / cam.zoom}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {selBox && tool === "cursor" && (
            <rect
              x={selBox.minX - 6}
              y={selBox.minY - 6}
              width={selBox.maxX - selBox.minX + 12}
              height={selBox.maxY - selBox.minY + 12}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={1.5 / cam.zoom}
              strokeDasharray={`${4 / cam.zoom} ${4 / cam.zoom}`}
            />
          )}
        </g>
      </svg>

      {/* bottom tool bar */}
      <div
        data-draw-ui
        className="bg-background absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-xl border p-1.5 shadow-lg"
      >
        <ToolButton
          active={tool === "pen"}
          label="Pen"
          onClick={() => setTool("pen")}
        >
          <Pencil className="size-4" />
        </ToolButton>
        <ToolButton
          active={tool === "cursor"}
          label="Select and move strokes"
          onClick={() => setTool("cursor")}
        >
          <MousePointer2 className="size-4" />
        </ToolButton>
        <ToolButton
          active={tool === "eraser"}
          label="Eraser"
          onClick={() => {
            setTool("eraser");
            setSelectedIdx(null);
          }}
        >
          <Eraser className="size-4" />
        </ToolButton>

        <span className="bg-border mx-1 h-5 w-px" />

        {/* color picker */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Pen color"
            >
              <span
                className="size-4.5 rounded"
                style={{ background: color }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-48 p-2" data-draw-ui>
            <div className="grid grid-cols-6 gap-1.5">
              {BASIC_COLORS.map((c) => (
                <ColorSwatch key={c} color={c} current={color} onPick={pickColor} />
              ))}
            </div>
            {recent.length > 0 && (
              <>
                <div className="text-muted-foreground mt-2 mb-1 text-[10px] font-medium tracking-wide uppercase">
                  Recent
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {recent.map((c) => (
                    <ColorSwatch key={c} color={c} current={color} onPick={pickColor} />
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
                value={color}
                className="size-0 opacity-0"
                onChange={(e) => pickCustom(e.target.value.toUpperCase())}
              />
            </label>
          </PopoverContent>
        </Popover>

        {/* pen size */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Pen size"
            >
              <span
                className="bg-foreground rounded-full"
                style={{ width: Math.min(size + 2, 16), height: Math.min(size + 2, 16) }}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" className="w-auto p-1.5" data-draw-ui>
            <div className="flex items-center gap-1">
              {PEN_SIZES.map((s) => (
                <button
                  key={s}
                  aria-label={`Pen size ${s}`}
                  className={cn(
                    "hover:bg-accent flex size-9 items-center justify-center rounded-md border border-transparent",
                    size === s && "border-foreground",
                  )}
                  onClick={() => {
                    setSize(s);
                    setTool("pen");
                  }}
                >
                  <span
                    className="bg-foreground rounded-full"
                    style={{ width: s + 3, height: s + 3 }}
                  />
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <span className="bg-border mx-1 h-5 w-px" />

        <ToolButton label="Undo" onClick={undo} disabled={!past.current.length}>
          <Undo2 className="size-4" />
        </ToolButton>
        <ToolButton label="Redo" onClick={redo} disabled={!future.current.length}>
          <Redo2 className="size-4" />
        </ToolButton>

        <span className="bg-border mx-1 h-5 w-px" />

        <Button variant="outline" size="sm" className="h-8" onClick={closeDraw}>
          Discard
        </Button>
        <Button size="sm" className="h-8" onClick={save}>
          Save
        </Button>
      </div>
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

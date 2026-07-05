"use client";

import * as React from "react";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  ArrowDash,
  ArrowJump,
  ArrowLine,
  ArrowSide,
  BoardArrow,
} from "@/lib/datac/board-types";
import { useBoard } from "./store";
import { screenToCanvas } from "./coords";
import { BASIC_COLORS } from "./sketch-session";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Pt {
  x: number;
  y: number;
}

// Outward normal of each side.
const NORMAL: Record<ArrowSide, Pt> = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/* ---- stroke presets -------------------------------------------------------- */
export const ARROW_WIDTHS = [1, 1.5, 2, 3, 4];

const DASH_PATTERNS: Record<ArrowDash, string | undefined> = {
  solid: undefined,
  dashed1: "6 4",
  dashed2: "10 6",
  dashed3: "16 8",
  dashed4: "24 12",
  // 0.1-length dashes + round linecap render as dots
  dotted1: "0.1 4",
  dotted2: "0.1 7",
  dotted3: "0.1 10",
  dotted4: "0.1 14",
};
const isDotted = (dash: ArrowDash) => dash.startsWith("dotted");

const DEFAULT_STROKE = "color-mix(in srgb, var(--foreground) 70%, transparent)";
const ACTIVE_STROKE = "#F43F5E"; // rose-500

const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

// Where the segment from a box's center toward `target` crosses its border
// (sharp/curved lines connect the components' centers, clipped here).
function borderClip(b: Box, target: Pt): Pt {
  const c = center(b);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (!dx && !dy) return c;
  const sx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
  const sy = dy ? b.h / 2 / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: c.x + dx * s, y: c.y + dy * s };
}

// Which side of the box a border point sits on (for elbow departure).
function clipSide(b: Box, p: Pt): ArrowSide {
  const dTop = Math.abs(p.y - b.y);
  const dBottom = Math.abs(p.y - (b.y + b.h));
  const dLeft = Math.abs(p.x - b.x);
  const dRight = Math.abs(p.x - (b.x + b.w));
  const m = Math.min(dTop, dBottom, dLeft, dRight);
  return m === dTop
    ? "top"
    : m === dBottom
      ? "bottom"
      : m === dLeft
        ? "left"
        : "right";
}

/* ---- orthogonal (round) routing ------------------------------------------ */
// Elbow routes are a Z family: depart along the source point's axis to the
// middle segment, run the middle segment, then into the target. The middle
// segment sits at `bend` (drag-adjustable); `bend2` displaces the long run
// sideways into a rectangular detour (drag across the line). By default the
// route collapses onto the target (single L-bend), or hops out a short stub
// when the target lies behind the departure direction.
export const elbowVertical = (s1: ArrowSide) => NORMAL[s1].y !== 0;

function elbowPoints(
  p1: Pt,
  s1: ArrowSide,
  p2: Pt,
  s2: ArrowSide,
  bend?: number,
  bend2?: number,
): Pt[] {
  const n1 = NORMAL[s1];
  const n2 = NORMAL[s2];
  const stub = 20;
  const dedupe = (pts: Pt[]) =>
    pts.filter(
      (p, i, arr) =>
        i === 0 || Math.hypot(p.x - arr[i - 1].x, p.y - arr[i - 1].y) > 0.5,
    );
  if (
    bend === undefined &&
    bend2 === undefined &&
    (Math.abs(p1.x - p2.x) < 1 || Math.abs(p1.y - p2.y) < 1)
  )
    return [p1, p2];
  if (elbowVertical(s1)) {
    if (bend2 !== undefined) {
      // sideways detour: out, across to bend2, along, back in
      const y1 = bend ?? p1.y + n1.y * stub;
      const y2 = n2.y !== 0 ? p2.y + n2.y * stub : p2.y;
      return dedupe([
        p1,
        { x: p1.x, y: y1 },
        { x: bend2, y: y1 },
        { x: bend2, y: y2 },
        { x: p2.x, y: y2 },
        p2,
      ]);
    }
    const by =
      bend ??
      (Math.sign(p2.y - p1.y) === n1.y ? p2.y : p1.y + n1.y * stub);
    return dedupe([p1, { x: p1.x, y: by }, { x: p2.x, y: by }, p2]);
  }
  if (bend2 !== undefined) {
    const x1 = bend ?? p1.x + n1.x * stub;
    const x2 = n2.x !== 0 ? p2.x + n2.x * stub : p2.x;
    return dedupe([
      p1,
      { x: x1, y: p1.y },
      { x: x1, y: bend2 },
      { x: x2, y: bend2 },
      { x: x2, y: p2.y },
      p2,
    ]);
  }
  const bx =
    bend ?? (Math.sign(p2.x - p1.x) === n1.x ? p2.x : p1.x + n1.x * stub);
  return dedupe([p1, { x: bx, y: p1.y }, { x: bx, y: p2.y }, p2]);
}

// Point halfway along a polyline (for the label).
function polylineMid(pts: Pt[]): Pt {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  let walk = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (walk <= seg) return nudge(pts[i - 1], pts[i], walk);
    walk -= seg;
  }
  return pts[Math.floor(pts.length / 2)];
}

// Move `p` toward `toward` by `by` units.
function nudge(p: Pt, toward: Pt, by: number): Pt {
  const dx = toward.x - p.x;
  const dy = toward.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: p.x + (dx / len) * by, y: p.y + (dy / len) * by };
}

/* ---- line jumps ------------------------------------------------------------ */
// Where the straight run p→q crosses any segment of the other polylines:
// sorted t parameters along p→q (endpoints excluded).
function runCrossings(p: Pt, q: Pt, others: Pt[][]): number[] {
  const out: number[] = [];
  const rx = q.x - p.x;
  const ry = q.y - p.y;
  for (const poly of others)
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i];
      const b = poly[i + 1];
      const sx = b.x - a.x;
      const sy = b.y - a.y;
      const denom = rx * sy - ry * sx;
      if (Math.abs(denom) < 1e-9) continue;
      const t = ((a.x - p.x) * sy - (a.y - p.y) * sx) / denom;
      const u = ((a.x - p.x) * ry - (a.y - p.y) * rx) / denom;
      if (t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98) out.push(t);
    }
  return out.sort((x, y) => x - y);
}

// One straight run as path commands, hopping over crossings in the chosen
// style. Hops too close to the ends or each other are skipped.
function runWithJumps(
  a: Pt,
  b: Pt,
  jump: ArrowJump,
  r: number,
  others: Pt[][],
): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (jump === "none" || len < r * 3 || !others.length)
    return ` L ${b.x} ${b.y}`;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const perp = { x: dir.y, y: -dir.x };
  const at = (t: number): Pt => ({
    x: a.x + dir.x * t,
    y: a.y + dir.y * t,
  });
  let out = "";
  let cursor = 0;
  for (const t of runCrossings(a, b, others)) {
    const c = t * len;
    if (c - r < cursor + 1 || c + r > len - 1) continue;
    const h1 = at(c - r);
    const h2 = at(c + r);
    const mid = at(c);
    out += ` L ${h1.x} ${h1.y}`;
    if (jump === "gap") out += ` M ${h2.x} ${h2.y}`;
    else if (jump === "arc") out += ` A ${r} ${r} 0 0 1 ${h2.x} ${h2.y}`;
    else if (jump === "round")
      out += ` Q ${mid.x + perp.x * r * 1.8} ${mid.y + perp.y * r * 1.8} ${h2.x} ${h2.y}`;
    else
      out += ` L ${mid.x + perp.x * r} ${mid.y + perp.y * r} L ${h2.x} ${h2.y}`;
    cursor = c + r;
  }
  out += ` L ${b.x} ${b.y}`;
  return out;
}

// Polyline → path: rounded interior corners, jump hops on the straight runs.
function polylinePath(
  pts: Pt[],
  cornerR: number,
  jump: ArrowJump,
  jumpR: number,
  others: Pt[][],
): string {
  const n = pts.length;
  if (n < 2) return "";
  const runs: { from: Pt; to: Pt }[] = [];
  const corners: { v: Pt; exit: Pt }[] = [];
  let prevExit = pts[0];
  for (let i = 1; i < n - 1; i++) {
    const inLen = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const outLen = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    const rr = Math.min(cornerR, inLen / 2, outLen / 2);
    runs.push({ from: prevExit, to: nudge(pts[i], pts[i - 1], rr) });
    const exit = nudge(pts[i], pts[i + 1], rr);
    corners.push({ v: pts[i], exit });
    prevExit = exit;
  }
  runs.push({ from: prevExit, to: pts[n - 1] });
  let d = `M ${pts[0].x} ${pts[0].y}`;
  runs.forEach((run, i) => {
    d += runWithJumps(run.from, run.to, jump, jumpR, others);
    if (i < corners.length)
      d += ` Q ${corners[i].v.x} ${corners[i].v.y} ${corners[i].exit.x} ${corners[i].exit.y}`;
  });
  return d;
}

// Flatten a quadratic curve for crossing detection.
function sampleQuad(p1: Pt, c: Pt, p2: Pt, steps = 12): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * p1.x + 2 * u * t * c.x + t * t * p2.x,
      y: u * u * p1.y + 2 * u * t * c.y + t * t * p2.y,
    });
  }
  return out;
}

/* ---- per-arrow geometry ----------------------------------------------------- */
interface ArrowGeom {
  a: BoardArrow;
  line: ArrowLine;
  s1: ArrowSide;
  // sharp/round: the trimmed polyline; curved shapes use `curve` instead
  pts: Pt[] | null;
  curve: { p1: Pt; c: Pt; p2: Pt } | null;
  flat: Pt[]; // flattened polyline for crossing detection + label midpoint
  handle: Pt; // draggable shape handle (line midpoint / through-point)
}

function arrowGeom(a: BoardArrow, A: Box, B: Box, gap: number): ArrowGeom {
  // straight center-to-center by default; legacy "curved" renders as sharp
  const line: ArrowLine = a.line === "round" ? "round" : "sharp";
  if (line === "round") {
    // center-anchored like sharp: the elbow departs from where the
    // center-to-center line exits each card's border
    const rawStart = borderClip(A, center(B));
    const rawEnd = borderClip(B, center(A));
    const s1 = clipSide(A, rawStart);
    const s2 = clipSide(B, rawEnd);
    const pts = elbowPoints(rawStart, s1, rawEnd, s2, a.bend, a.bend2);
    const n = pts.length;
    pts[n - 1] = nudge(rawEnd, pts[n - 2], gap);
    if (a.both) pts[0] = nudge(rawStart, pts[1], gap);
    return { a, line, s1, pts, curve: null, flat: pts, handle: polylineMid(pts) };
  }
  // sharp/curved connect the components' CENTERS, clipped at the borders.
  // A dragged shape handle (bend=x, bend2=y) is a through-point: the line
  // becomes a curve passing through it, and the border clips aim at it.
  const ctrl =
    a.bend !== undefined && a.bend2 !== undefined
      ? { x: a.bend, y: a.bend2 }
      : null;
  const cA = center(A);
  const cB = center(B);
  const rawStart = borderClip(A, ctrl ?? cB);
  const rawEnd = borderClip(B, ctrl ?? cA);
  const p2 = nudge(rawEnd, ctrl ?? rawStart, gap);
  const p1 = a.both ? nudge(rawStart, ctrl ?? rawEnd, gap) : rawStart;
  const s1: ArrowSide = "top"; // unused for center-anchored styles
  if (ctrl) {
    // quadratic that passes through the handle at t = 0.5
    const c = {
      x: 2 * ctrl.x - (p1.x + p2.x) / 2,
      y: 2 * ctrl.y - (p1.y + p2.y) / 2,
    };
    return {
      a,
      line,
      s1,
      pts: null,
      curve: { p1, c, p2 },
      flat: sampleQuad(p1, c, p2),
      handle: ctrl,
    };
  }
  const pts = [p1, p2];
  return {
    a,
    line,
    s1,
    pts,
    curve: null,
    flat: pts,
    handle: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
  };
}

// Connection arrows between cards, rendered inside the transformed canvas
// layer (under the cards). Anchors follow the cards live; auto-height card
// sizes are measured from the DOM. Right-click an arrow for its settings.
export function ArrowsLayer() {
  const {
    arrows,
    cards,
    camera,
    pendingArrow,
    selectedArrowId,
    setSelectedArrowId,
    updateArrow,
    removeArrow,
  } = useBoard();
  // DOM measuring is client-only; the SSR pass renders nothing.
  const [mounted, setMounted] = React.useState(false);
  const [labelEdit, setLabelEdit] = React.useState<BoardArrow | null>(null);
  React.useEffect(() => setMounted(true), []);
  if (!mounted || (!arrows.length && !pendingArrow)) return null;

  // Drag a round line to adjust it. The drag's dominant direction picks the
  // parameter: along the departure axis moves the middle segment (`bend`);
  // across it displaces the long run sideways (`bend2`) so the line can be
  // pulled around components.
  const cameraRef = { current: camera };
  const startBendDrag = (a: BoardArrow, s1: ArrowSide, e: React.PointerEvent) => {
    const id = e.pointerId;
    const vertical = elbowVertical(s1);
    let axis: "bend" | "bend2" | null = null;
    const sx = e.clientX;
    const sy = e.clientY;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!axis) {
        if (Math.hypot(dx, dy) < 4) return;
        // vertical-first: vertical drag → bend (y), horizontal → bend2 (x)
        const draggingMainAxis = vertical
          ? Math.abs(dy) >= Math.abs(dx)
          : Math.abs(dx) >= Math.abs(dy);
        axis = draggingMainAxis ? "bend" : "bend2";
      }
      const vp = document.querySelector("[data-board-viewport]");
      const r = vp?.getBoundingClientRect();
      if (!r) return;
      const p = screenToCanvas(
        { x: ev.clientX - r.left, y: ev.clientY - r.top },
        cameraRef.current,
      );
      const value = Math.round(
        axis === "bend" ? (vertical ? p.y : p.x) : vertical ? p.x : p.y,
      );
      updateArrow(a.id, { [axis]: value });
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // Drag the shape handle of a sharp/curved line: the line becomes a curve
  // passing through the pointer (stored as bend=x, bend2=y).
  const startCtrlDrag = (a: BoardArrow, e: React.PointerEvent) => {
    const id = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const vp = document.querySelector("[data-board-viewport]");
      const r = vp?.getBoundingClientRect();
      if (!r) return;
      const p = screenToCanvas(
        { x: ev.clientX - r.left, y: ev.clientY - r.top },
        cameraRef.current,
      );
      updateArrow(a.id, { bend: Math.round(p.x), bend2: Math.round(p.y) });
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const byId = new Map(cards.map((c) => [c.id, c]));
  const boxOf = (id: string): Box | null => {
    const c = byId.get(id);
    if (!c) return null;
    const el = document.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
    const h =
      c.h ?? (el ? el.getBoundingClientRect().height / camera.zoom : 80);
    return { x: c.x, y: c.y, w: c.w, h };
  };

  const head = 9; // arrowhead length in canvas units

  // geometry pass (all arrows first, so jumps can see every other line)
  const geoms: ArrowGeom[] = [];
  for (const a of arrows) {
    const A = boxOf(a.from);
    const B = boxOf(a.to);
    if (A && B) geoms.push(arrowGeom(a, A, B, head * 0.9));
  }

  return (
    <>
      {/* 1x1, not 0x0: the SVG spec DISABLES rendering entirely for
          zero-sized svgs — overflow: visible then shows nothing. */}
      <svg
        className="absolute top-0 left-0 overflow-visible"
        width={1}
        height={1}
        aria-label="Card connections"
      >
        <defs>
          {/* context-stroke: heads inherit each line's stroke color */}
          <marker
            id="dc-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth={head}
            markerHeight={head}
            markerUnits="userSpaceOnUse"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
          <marker
            id="dc-arrow-start"
            viewBox="0 0 10 10"
            refX="1"
            refY="5"
            markerWidth={head}
            markerHeight={head}
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>

        {geoms.map((g) => {
          const a = g.a;
          const line = g.line;
          const width = a.width ?? 1.5;
          const dash = a.dash ?? "solid";
          const jump = a.jump ?? "none";
          const active = selectedArrowId === a.id;
          const others = geoms.filter((o) => o.a.id !== a.id).map((o) => o.flat);
          const d = g.curve
            ? `M ${g.curve.p1.x} ${g.curve.p1.y} Q ${g.curve.c.x} ${g.curve.c.y} ${g.curve.p2.x} ${g.curve.p2.y}`
            : polylinePath(
                g.pts!,
                line === "round" ? 12 : 0,
                jump,
                Math.max(6, width * 2.5),
                others,
              );
          const mid = polylineMid(g.flat);
          return (
            <ContextMenu key={a.id}>
              <ContextMenuTrigger asChild>
                <g
                  onContextMenu={(e) => {
                    e.stopPropagation(); // keep the canvas menu closed
                    setSelectedArrowId(a.id);
                  }}
                >
                  <path
                    d={d}
                    fill="none"
                    strokeWidth={width}
                    strokeDasharray={DASH_PATTERNS[dash]}
                    strokeLinecap={isDotted(dash) ? "round" : undefined}
                    style={{ stroke: active ? ACTIVE_STROKE : (a.color ?? DEFAULT_STROKE) }}
                    markerEnd="url(#dc-arrow)"
                    markerStart={a.both ? "url(#dc-arrow-start)" : undefined}
                  />
                  {/* fat invisible twin: click target + drag-to-adjust */}
                  <path
                    d={d}
                    fill="none"
                    strokeWidth={Math.max(14 / camera.zoom, width + 8)}
                    stroke="transparent"
                    pointerEvents="stroke"
                    className="cursor-move"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelectedArrowId(a.id);
                      if (e.button !== 0) return;
                      if (line === "round") startBendDrag(a, g.s1, e);
                      else startCtrlDrag(a, e);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedArrowId(a.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setLabelEdit(a);
                    }}
                  />
                  {/* shape handle: drag to reshape (through-point / elbow) */}
                  {active && (
                    <circle
                      cx={g.handle.x}
                      cy={g.handle.y}
                      r={4.5 / camera.zoom}
                      strokeWidth={1.5 / camera.zoom}
                      className="fill-background stroke-foreground cursor-move"
                      pointerEvents="all"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        if (e.button !== 0) return;
                        if (line === "round") startBendDrag(a, g.s1, e);
                        else startCtrlDrag(a, e);
                      }}
                    />
                  )}
                  {a.label && (
                    <text
                      x={mid.x}
                      y={mid.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      paintOrder="stroke"
                      strokeWidth={5}
                      className="stroke-background fill-foreground text-xs select-none"
                    >
                      {a.label}
                    </text>
                  )}
                </g>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem onClick={() => setLabelEdit(a)}>
                  {a.label ? "Edit label…" : "Add label…"}
                </ContextMenuItem>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Line</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-28">
                    <ContextMenuRadioGroup
                      value={line}
                      onValueChange={(v) =>
                        // bend semantics differ per style — start clean
                        updateArrow(a.id, {
                          line: v as ArrowLine,
                          bend: undefined,
                          bend2: undefined,
                        })
                      }
                    >
                      <ContextMenuRadioItem value="sharp">
                        Sharp
                      </ContextMenuRadioItem>
                      <ContextMenuRadioItem value="round">
                        Round
                      </ContextMenuRadioItem>
                    </ContextMenuRadioGroup>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Line size</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-28">
                    <ContextMenuRadioGroup
                      value={String(width)}
                      onValueChange={(v) =>
                        updateArrow(a.id, { width: Number(v) })
                      }
                    >
                      {ARROW_WIDTHS.map((w) => (
                        <ContextMenuRadioItem key={w} value={String(w)}>
                          <span
                            className="bg-foreground w-8 rounded"
                            style={{ height: w }}
                          />
                          {w}
                        </ContextMenuRadioItem>
                      ))}
                    </ContextMenuRadioGroup>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Line type</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-32">
                    <ContextMenuRadioGroup
                      value={dash}
                      onValueChange={(v) =>
                        updateArrow(a.id, { dash: v as ArrowDash })
                      }
                    >
                      <ContextMenuRadioItem value="solid">
                        Solid
                      </ContextMenuRadioItem>
                      {[1, 2, 3, 4].map((n) => (
                        <ContextMenuRadioItem key={`da${n}`} value={`dashed${n}`}>
                          Dashed {n}
                        </ContextMenuRadioItem>
                      ))}
                      {[1, 2, 3, 4].map((n) => (
                        <ContextMenuRadioItem key={`do${n}`} value={`dotted${n}`}>
                          Dotted {n}
                        </ContextMenuRadioItem>
                      ))}
                    </ContextMenuRadioGroup>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Line color</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-36">
                    <ContextMenuItem
                      onClick={() => updateArrow(a.id, { color: undefined })}
                    >
                      <span className="bg-foreground/70 size-3 rounded-full" />
                      Default
                    </ContextMenuItem>
                    <div className="grid grid-cols-6 gap-1 p-1.5">
                      {BASIC_COLORS.map((c) => (
                        <button
                          key={c}
                          aria-label={`Line color ${c}`}
                          className="size-5 rounded border border-black/10"
                          style={{ background: c }}
                          onClick={() => updateArrow(a.id, { color: c })}
                        />
                      ))}
                    </div>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSub>
                  <ContextMenuSubTrigger>Line jumps</ContextMenuSubTrigger>
                  <ContextMenuSubContent className="w-28">
                    <ContextMenuRadioGroup
                      value={jump}
                      onValueChange={(v) =>
                        updateArrow(a.id, { jump: v as ArrowJump })
                      }
                    >
                      {(["none", "gap", "arc", "round", "line"] as const).map(
                        (j) => (
                          <ContextMenuRadioItem key={j} value={j}>
                            {j[0].toUpperCase() + j.slice(1)}
                          </ContextMenuRadioItem>
                        ),
                      )}
                    </ContextMenuRadioGroup>
                  </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuCheckboxItem
                  checked={!!a.both}
                  onCheckedChange={(v) =>
                    updateArrow(a.id, { both: v === true })
                  }
                >
                  Both-side arrows
                </ContextMenuCheckboxItem>
                {(a.bend !== undefined || a.bend2 !== undefined) && (
                  <ContextMenuItem
                    onClick={() =>
                      updateArrow(a.id, { bend: undefined, bend2: undefined })
                    }
                  >
                    Reset shape
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onClick={() => removeArrow(a.id)}
                >
                  Delete arrow
                  <span className="text-muted-foreground ml-auto text-xs">
                    ⌫
                  </span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}

        {/* arrow being dragged out of a connection handle */}
        {pendingArrow &&
          (() => {
            const A = boxOf(pendingArrow.from);
            if (!A) return null;
            const target = { x: pendingArrow.x, y: pendingArrow.y };
            // preview matches the final look: center-anchored, border-clipped
            const p1 = borderClip(A, target);
            return (
              <line
                x1={p1.x}
                y1={p1.y}
                x2={target.x}
                y2={target.y}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                style={{ stroke: ACTIVE_STROKE }}
                markerEnd="url(#dc-arrow)"
              />
            );
          })()}
      </svg>

      <ArrowLabelDialog
        key={labelEdit?.id ?? "closed"}
        arrow={labelEdit}
        onClose={() => setLabelEdit(null)}
      />
    </>
  );
}

function ArrowLabelDialog({
  arrow,
  onClose,
}: {
  arrow: BoardArrow | null;
  onClose: () => void;
}) {
  const { updateArrow } = useBoard();
  const [label, setLabel] = React.useState(arrow?.label ?? "");

  function save() {
    if (arrow) updateArrow(arrow.id, { label: label.trim() });
    onClose();
  }

  return (
    <Dialog open={!!arrow} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="sm:max-w-sm"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Arrow label</DialogTitle>
        </DialogHeader>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

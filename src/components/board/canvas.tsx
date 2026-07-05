"use client";

import * as React from "react";
import { toast } from "sonner";
import { useBoard } from "./store";
import { screenToCanvas, zoomAtPoint, type Point } from "./coords";
import { boardOverlayOpen, usePointerDrag } from "./use-drag";
import { newCard } from "./new-card";
import { readAsDataURL } from "@/lib/datac/upload";
import type { BoardCardType, Camera } from "@/lib/datac/board-types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { CardShell } from "./card-shell";
import { ArrowsLayer } from "./arrows-layer";

const ADDABLE: { type: BoardCardType; label: string }[] = [
  { type: "note", label: "Note" },
  { type: "heading", label: "Heading" },
  { type: "image", label: "Image" },
  { type: "link", label: "Link" },
  { type: "todo", label: "To-do list" },
  { type: "board", label: "Board" },
  { type: "column", label: "Column" },
  { type: "table", label: "Table" },
  { type: "color", label: "Color swatch" },
  { type: "page", label: "Page" },
];

const GRID = 24; // dot spacing at zoom 1

// Marquee rectangle in viewport (screen) coords.
interface Marquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const isEditableTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  !!t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]');

export function BoardCanvas() {
  const {
    cards,
    camera,
    setCamera,
    selection,
    setSelection,
    addCard,
    removeCards,
    duplicateCards,
    updateCards,
    client,
    saveNow,
    drawMode,
    guides,
    cutCards,
    copyCards,
    pasteCards,
    hasClipboard,
    removeArrow,
    selectedArrowId,
    undo,
    redo,
  } = useBoard();

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const cameraRef = React.useRef(camera);
  cameraRef.current = camera;
  const cardsRef = React.useRef(cards);
  cardsRef.current = cards;
  const selectionRef = React.useRef(selection);
  selectionRef.current = selection;

  const [spaceHeld, setSpaceHeld] = React.useState(false);
  const [panning, setPanning] = React.useState(false);
  const [marquee, setMarquee] = React.useState<Marquee | null>(null);
  const drawModeRef = React.useRef(drawMode);
  drawModeRef.current = drawMode;
  const selectedArrowRef = React.useRef(selectedArrowId);
  selectedArrowRef.current = selectedArrowId;

  // Viewport-relative point for a client-coords event.
  const toViewport = React.useCallback((e: { clientX: number; clientY: number }): Point => {
    const r = viewportRef.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  }, []);

  const canvasPoint = React.useCallback(
    (e: { clientX: number; clientY: number }) =>
      screenToCanvas(toViewport(e), cameraRef.current),
    [toViewport],
  );

  /* ---- wheel: plain scroll pans, ctrl/cmd (and pinch) zooms -------------- */
  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (boardOverlayOpen()) return; // reading panel / lightbox up
      e.preventDefault();
      const cam = cameraRef.current;
      if (e.ctrlKey || e.metaKey) {
        // macOS pinch arrives as ctrl+wheel
        const next = zoomAtPoint(cam, toViewport(e), cam.zoom * Math.exp(-e.deltaY * 0.01));
        setCamera(next);
      } else {
        setCamera({ ...cam, x: cam.x - e.deltaX, y: cam.y - e.deltaY });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [setCamera, toViewport]);

  /* ---- keyboard ---------------------------------------------------------- */
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (drawModeRef.current) return; // draw mode owns the keyboard
      if (boardOverlayOpen()) return; // reading panel / lightbox open
      if (isEditableTarget(e.target)) return;
      if (e.code === "Space") {
        setSpaceHeld(true);
        e.preventDefault();
        return;
      }
      const sel = [...selectionRef.current];
      const mod = e.metaKey || e.ctrlKey;
      if ((e.key === "Delete" || e.key === "Backspace") && sel.length) {
        removeCards(sel);
        e.preventDefault();
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedArrowRef.current
      ) {
        removeArrow(selectedArrowRef.current);
        e.preventDefault();
      } else if (e.key === "Escape") {
        setSelection(new Set());
      } else if (mod && e.key.toLowerCase() === "a") {
        setSelection(new Set(cardsRef.current.map((c) => c.id)));
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "d" && sel.length) {
        duplicateCards(sel);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "x" && sel.length) {
        cutCards(sel);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "c" && sel.length) {
        copyCards(sel);
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "v" && hasClipboard()) {
        pasteCards();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "z" && e.shiftKey) {
        redo();
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "z") {
        undo();
        e.preventDefault();
      } else if (mod && e.key === "0") {
        const r = viewportRef.current?.getBoundingClientRect();
        setCamera(
          zoomAtPoint(
            cameraRef.current,
            { x: (r?.width ?? 0) / 2, y: (r?.height ?? 0) / 2 },
            1,
          ),
        );
        e.preventDefault();
      } else if (mod && e.key.toLowerCase() === "s") {
        saveNow();
        e.preventDefault();
      } else if (e.key.startsWith("Arrow") && sel.length) {
        const step = e.shiftKey ? 16 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const batch: Record<string, { x: number; y: number }> = {};
        for (const c of cardsRef.current)
          if (selectionRef.current.has(c.id) && !c.locked)
            batch[c.id] = { x: c.x + dx, y: c.y + dy };
        updateCards(batch);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [removeCards, duplicateCards, setSelection, setCamera, saveNow, updateCards, cutCards, copyCards, pasteCards, hasClipboard, removeArrow, undo, redo]);

  /* ---- background drag: pan (space/middle) or marquee -------------------- */
  const panState = React.useRef<Camera>(camera);
  const marqueeStart = React.useRef<Point>({ x: 0, y: 0 });

  const beginPan = () => {
    panState.current = cameraRef.current;
    setPanning(true);
  };
  const movePan = (d: { dx: number; dy: number }) => {
    setCamera({
      ...panState.current,
      x: panState.current.x + d.dx,
      y: panState.current.y + d.dy,
    });
  };

  // Select every card whose on-screen rect intersects the marquee.
  const applyMarquee = React.useCallback(
    (m: Marquee, additive: boolean) => {
      const r = viewportRef.current?.getBoundingClientRect();
      if (!r) return;
      const [mx0, mx1] = [Math.min(m.x0, m.x1), Math.max(m.x0, m.x1)];
      const [my0, my1] = [Math.min(m.y0, m.y1), Math.max(m.y0, m.y1)];
      const next = new Set<string>(additive ? selectionRef.current : []);
      viewportRef.current
        ?.querySelectorAll<HTMLElement>("[data-card-id]")
        .forEach((el) => {
          const b = el.getBoundingClientRect();
          const x0 = b.left - r.left;
          const y0 = b.top - r.top;
          if (x0 < mx1 && x0 + b.width > mx0 && y0 < my1 && y0 + b.height > my0)
            next.add(el.dataset.cardId!);
        });
      setSelection(next);
    },
    [setSelection],
  );

  const onBackgroundDown = usePointerDrag({
    onStart: (e) => {
      if (boardOverlayOpen()) return false;
      // only presses on the empty canvas itself, not on a card
      if ((e.target as HTMLElement).closest("[data-card-id]")) return false;
      if (spaceHeld) {
        beginPan();
      } else {
        marqueeStart.current = toViewport(e);
        setMarquee(null);
      }
    },
    onMove: (e, d) => {
      if (panning || spaceHeld) {
        movePan(d);
        return;
      }
      if (!d.moved) return;
      const p = toViewport(e);
      const m = {
        x0: marqueeStart.current.x,
        y0: marqueeStart.current.y,
        x1: p.x,
        y1: p.y,
      };
      setMarquee(m);
      applyMarquee(m, e.shiftKey);
    },
    onEnd: (e, d) => {
      setPanning(false);
      setMarquee(null);
      if (!d.moved && !spaceHeld && !e.shiftKey) setSelection(new Set());
    },
  });

  const onMiddleDown = usePointerDrag({
    button: 1,
    onStart: () => {
      if (boardOverlayOpen()) return false;
      beginPan();
    },
    onMove: (_e, d) => movePan(d),
    onEnd: () => setPanning(false),
  });

  /* ---- dropping image files onto the canvas ------------------------------ */
  const addImageFiles = React.useCallback(
    async (files: File[], at: Point) => {
      let offset = 0;
      for (const file of files) {
        try {
          const dataUrl = await readAsDataURL(file);
          const up = await client.upload(file.name, dataUrl);
          if (up.error || !up.url) {
            toast.error(up.error || "Upload failed");
            continue;
          }
          const dims = await new Promise<{ w: number; h: number } | null>(
            (res) => {
              const img = new Image();
              img.onload = () =>
                res({ w: img.naturalWidth, h: img.naturalHeight });
              img.onerror = () => res(null);
              img.src = dataUrl;
            },
          );
          addCard(
            newCard("image", { x: at.x + offset, y: at.y + offset }, {
              src: up.url,
              ...(dims ? { natW: dims.w, natH: dims.h } : {}),
            }),
          );
          offset += 24;
        } catch {
          toast.error("Upload failed");
        }
      }
    },
    [addCard, client],
  );

  const [dropActive, setDropActive] = React.useState(false);

  // Where the last canvas right-click landed, in canvas coords — the
  // "Add … here" menu items insert at this point.
  const menuPoint = React.useRef<Point>({ x: 0, y: 0 });

  /* ---- render ------------------------------------------------------------ */
  const sorted = React.useMemo(
    () => cards.slice().sort((a, b) => a.z - b.z),
    [cards],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
      ref={viewportRef}
      data-board-viewport
      className="relative flex-1 select-none overflow-hidden"
      onContextMenu={(e) => {
        menuPoint.current = canvasPoint(e);
      }}
      style={{
        touchAction: "none",
        cursor: panning ? "grabbing" : spaceHeld ? "grab" : undefined,
        backgroundImage:
          "radial-gradient(circle, var(--border) 1px, transparent 1px)",
        backgroundSize: `${GRID * camera.zoom}px ${GRID * camera.zoom}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
      onPointerDown={(e) => {
        if (e.button === 1) onMiddleDown(e);
        else onBackgroundDown(e);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDropActive(true);
        }
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={(e) => {
        setDropActive(false);
        const files = [...e.dataTransfer.files].filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return;
        e.preventDefault();
        addImageFiles(files, canvasPoint(e));
      }}
    >
      {/* transformed content layer */}
      <div
        className="absolute top-0 left-0 h-0 w-0"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        <ArrowsLayer />
        {sorted.map((c) => (
          <CardShell key={c.id} card={c} />
        ))}

        {/* smart alignment guides (1px on screen at any zoom) */}
        {guides?.v && (
          <div
            className="pointer-events-none absolute z-[9999] bg-rose-500"
            style={{
              left: guides.v.x,
              top: guides.v.y0 - 8,
              width: 1 / camera.zoom,
              height: guides.v.y1 - guides.v.y0 + 16,
            }}
          />
        )}
        {guides?.h && (
          <div
            className="pointer-events-none absolute z-[9999] bg-rose-500"
            style={{
              left: guides.h.x0 - 8,
              top: guides.h.y,
              width: guides.h.x1 - guides.h.x0 + 16,
              height: 1 / camera.zoom,
            }}
          />
        )}
      </div>

      {/* marquee overlay (screen space) */}
      {marquee && (
        <div
          className="border-primary/60 bg-primary/10 pointer-events-none absolute border"
          style={{
            left: Math.min(marquee.x0, marquee.x1),
            top: Math.min(marquee.y0, marquee.y1),
            width: Math.abs(marquee.x1 - marquee.x0),
            height: Math.abs(marquee.y1 - marquee.y0),
          }}
        />
      )}

      {dropActive && (
        <div className="border-primary/50 bg-primary/5 pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed" />
      )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        {ADDABLE.map(({ type, label }) => (
          <ContextMenuItem
            key={type}
            onClick={() => addCard(newCard(type, menuPoint.current))}
          >
            Add {label.toLowerCase()}
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}

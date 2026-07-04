"use client";

import * as React from "react";

export interface DragDelta {
  dx: number; // screen px since pointerdown — divide by zoom for canvas units
  dy: number;
  moved: boolean; // true once the pointer travelled past the click threshold
}

const CLICK_SLOP = 3; // px before a press counts as a drag, not a click

// True while a blocking overlay (page reading panel, image lightbox) is up —
// every board interaction must refuse to start, regardless of whether the
// overlay's own event blocking holds.
export const boardOverlayOpen = () =>
  !!document.querySelector(
    '[data-slot="sheet-content"][data-state="open"], [data-lightbox]',
  );

// Window-listener drag: returns a pointerdown handler. Screen-space deltas
// are reported to onMove/onEnd; callers convert to canvas units (÷ zoom).
// Deliberately NO setPointerCapture — capture retargets click/dblclick to
// the captured element, which would swallow double-clicks on children
// (e.g. the color swatch's picker). Window listeners track the gesture.
export function usePointerDrag(handlers: {
  // Return false to ignore this press (e.g. wrong target).
  onStart?: (e: React.PointerEvent) => boolean | void;
  onMove?: (e: PointerEvent, d: DragDelta) => void;
  onEnd?: (e: PointerEvent, d: DragDelta) => void;
  button?: number; // default 0 (left)
}) {
  const ref = React.useRef(handlers);
  ref.current = handlers;

  return React.useCallback((e: React.PointerEvent) => {
    const wanted = ref.current.button ?? 0;
    if (e.button !== wanted) return;
    if (ref.current.onStart?.(e) === false) return;
    const id = e.pointerId;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;

    const delta = (ev: PointerEvent): DragDelta => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      if (!moved && Math.hypot(dx, dy) > CLICK_SLOP) moved = true;
      return { dx, dy, moved };
    };
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      ref.current.onMove?.(ev, delta(ev));
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      ref.current.onEnd?.(ev, delta(ev));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, []);
}

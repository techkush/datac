// Pure coordinate math for the board canvas. The canvas content div is
// transformed with `translate(camera.x, camera.y) scale(camera.zoom)`
// (origin 0 0), so:  screen = canvas * zoom + camera.

import { MAX_ZOOM, MIN_ZOOM, type Camera } from "@/lib/datac/board-types";

export interface Point {
  x: number;
  y: number;
}

// `screen` is viewport-relative (client coords minus the viewport rect).
export function screenToCanvas(screen: Point, cam: Camera): Point {
  return {
    x: (screen.x - cam.x) / cam.zoom,
    y: (screen.y - cam.y) / cam.zoom,
  };
}

export function canvasToScreen(canvas: Point, cam: Camera): Point {
  return {
    x: canvas.x * cam.zoom + cam.x,
    y: canvas.y * cam.zoom + cam.y,
  };
}

export const clampZoom = (z: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// Zoom about a fixed screen point c (viewport-relative), so whatever is
// under the cursor stays under the cursor: cam' = c - (c - cam) * (z'/z).
export function zoomAtPoint(cam: Camera, c: Point, nextZoom: number): Camera {
  const zoom = clampZoom(nextZoom);
  const k = zoom / cam.zoom;
  return {
    zoom,
    x: c.x - (c.x - cam.x) * k,
    y: c.y - (c.y - cam.y) * k,
  };
}

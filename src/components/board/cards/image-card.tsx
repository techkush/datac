"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Download, ExternalLink, ImagePlus, PenLine } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { readAsDataURL } from "@/lib/datac/upload";
import { useBoard } from "../store";
import type { ImageCard, SketchStroke } from "@/lib/datac/board-types";
import { strokePath } from "./sketch-card";
import { SketchToolbar, useSketchSession, type Pt } from "../sketch-session";
import { useCardEditing } from "../card-edit-context";
import { cn } from "@/lib/utils";

// Annotation strokes stretched over the image (same viewBox wherever the
// image renders — card or lightbox).
function AnnotationOverlay({ card }: { card: ImageCard }) {
  if (!card.strokes?.length || !card.annW || !card.annH) return null;
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${card.annW} ${card.annH}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {card.strokes.map((s, i) => (
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
    </svg>
  );
}

// Save the original file to disk (same-origin /api/w/…/files/ URL).
export async function downloadImage(src: string) {
  try {
    const blob = await fetch(src).then((r) => {
      if (!r.ok) throw new Error();
      return r.blob();
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = decodeURIComponent(src.split("/").pop() || "image");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch {
    toast.error("Download failed");
  }
}

// Image-specific context-menu section (rendered inside the card shell menu).
export function ImageMenuItems({ card }: { card: ImageCard }) {
  const { updateCard } = useBoard();
  return (
    <>
      <ContextMenuSeparator />
      {/* clearing src brings back the picker empty-state */}
      <ContextMenuItem onClick={() => updateCard(card.id, { src: "" })}>
        Replace image
      </ContextMenuItem>
      <ContextMenuItem
        disabled={!card.src}
        onClick={() => downloadImage(card.src)}
      >
        Download original image
      </ContextMenuItem>
    </>
  );
}

export function ImageCardView({ card }: { card: ImageCard }) {
  const { updateCard, client, selection } = useBoard();
  const edit = useCardEditing();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [lightbox, setLightbox] = React.useState(false);

  // Shell double-click opens the viewer (content is inert on the board).
  React.useEffect(() => {
    if (!edit || !card.src) return;
    edit.openRef.current = () => setLightbox(true);
    return () => {
      edit.openRef.current = null;
    };
  }, [edit, card.src]);

  async function pick(file: File) {
    setBusy(true);
    try {
      const dataUrl = await readAsDataURL(file);
      const up = await client.upload(file.name, dataUrl);
      if (up.error || !up.url) {
        toast.error(up.error || "Upload failed");
        return;
      }
      const img = new Image();
      img.onload = () =>
        updateCard(card.id, {
          src: up.url,
          natW: img.naturalWidth,
          natH: img.naturalHeight,
          h: Math.round((card.w * img.naturalHeight) / img.naturalWidth),
        });
      img.onerror = () => updateCard(card.id, { src: up.url });
      img.src = dataUrl;
    } catch {
      toast.error("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  if (!card.src) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 p-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pick(f);
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          {busy ? "Uploading…" : "Choose image"}
        </Button>
        <p className="text-muted-foreground text-xs">
          …or drop an image on the canvas
        </p>
      </div>
    );
  }

  const showCaption = selection.has(card.id) || !!card.caption;

  return (
    <>
      <figure className="flex flex-col">
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.src}
            alt={card.caption || ""}
            draggable={false}
            className="w-full rounded-t-md object-cover"
            style={
              card.h ? { height: card.h - (showCaption ? 30 : 2) } : undefined
            }
          />
          <AnnotationOverlay card={card} />
        </div>
        {showCaption && (
          // caption stays editable with a single click while selected
          <input
            value={card.caption || ""}
            onChange={(e) => updateCard(card.id, { caption: e.target.value })}
            placeholder="Add a caption"
            aria-label="Image caption"
            className="placeholder:text-muted-foreground/70 text-muted-foreground pointer-events-auto bg-transparent px-2.5 py-1 text-xs outline-none"
          />
        )}
      </figure>
      {lightbox && (
        <ImageLightbox card={card} onClose={() => setLightbox(false)} />
      )}
    </>
  );
}

// Full-screen viewer: dimmed backdrop, the image with its caption bar, and a
// bottom toolbar (Download / New tab / Draw). Draw annotates THIS image only,
// in place — strokes save onto the card and render wherever the image does.
// Rendered through a portal — the canvas ancestors are CSS-transformed,
// which would break position:fixed.
function ImageLightbox({
  card,
  onClose,
}: {
  card: ImageCard;
  onClose: () => void;
}) {
  const [annotating, setAnnotating] = React.useState(false);
  const annotatingRef = React.useRef(annotating);
  annotatingRef.current = annotating;

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      // annotating: Escape belongs to the annotator (popover → discard)
      if (annotatingRef.current) return;
      onClose();
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [onClose]);

  return createPortal(
    <div
      data-lightbox
      role="dialog"
      aria-label="Image viewer"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/80 p-8"
      onClick={() => {
        if (!annotatingRef.current) onClose();
      }}
      // the board canvas must not react to events under the viewer
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {annotating ? (
        <ImageAnnotator card={card} onDone={() => setAnnotating(false)} />
      ) : (
        <>
          <figure
            className="flex min-h-0 flex-col overflow-hidden rounded-md bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative min-h-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.src}
                alt={card.caption || ""}
                draggable={false}
                className="max-h-[78vh] max-w-[88vw] object-contain"
              />
              <AnnotationOverlay card={card} />
            </div>
            {card.caption && (
              <figcaption className="px-4 py-3 text-sm text-neutral-700">
                {card.caption}
              </figcaption>
            )}
          </figure>

          <div
            className="bg-background flex items-center gap-1 rounded-xl border p-1.5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => downloadImage(card.src)}
            >
              <Download className="size-4" /> Download
            </Button>
            <span className="bg-border h-5 w-px" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => window.open(card.src, "_blank", "noopener")}
            >
              <ExternalLink className="size-4" /> New tab
            </Button>
            <span className="bg-border h-5 w-px" />
            <Button
              variant="ghost"
              size="sm"
              className="h-8"
              onClick={() => setAnnotating(true)}
            >
              <PenLine className="size-4" /> Draw
            </Button>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}

// Drawing scoped to the image: a sketch session in the displayed image's
// pixel space. Save stores the strokes (and that space) on the card.
function ImageAnnotator({
  card,
  onDone,
}: {
  card: ImageCard;
  onDone: () => void;
}) {
  const imgRef = React.useRef<HTMLImageElement | null>(null);
  // Displayed size once the image lays out — existing annotations are
  // rescaled from their saved space into the current one.
  const [disp, setDisp] = React.useState<{ w: number; h: number } | null>(null);
  const [initial, setInitial] = React.useState<SketchStroke[] | null>(null);

  const measure = React.useCallback(() => {
    const el = imgRef.current;
    if (!el || !el.clientWidth) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const sx = card.annW ? w / card.annW : 1;
    const sy = card.annH ? h / card.annH : 1;
    setInitial(
      (card.strokes || []).map((s) => ({
        ...s,
        width: s.width * ((sx + sy) / 2),
        points: s.points.map(([x, y]): Pt => [x * sx, y * sy]),
      })),
    );
    setDisp({ w, h });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="flex min-h-0 flex-col items-center gap-4"
      onClick={(e) => e.stopPropagation()}
    >
      {/* no overflow-hidden here: the tool bar hangs below the frame */}
      <div className="relative min-h-0 rounded-md bg-white shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={card.src}
          alt=""
          draggable={false}
          className="max-h-[74vh] max-w-[88vw] rounded-md object-contain"
          onLoad={measure}
        />
        {disp && initial && (
          <AnnotateSurface
            card={card}
            disp={disp}
            initial={initial}
            onDone={onDone}
          />
        )}
      </div>
    </div>
  );
}

function AnnotateSurface({
  card,
  disp,
  initial,
  onDone,
}: {
  card: ImageCard;
  disp: { w: number; h: number };
  initial: SketchStroke[];
  onDone: () => void;
}) {
  const { updateCard } = useBoard();
  const surfRef = React.useRef<HTMLDivElement | null>(null);

  const s = useSketchSession({
    initial,
    toLocal: (e) => {
      const r = surfRef.current!.getBoundingClientRect();
      return [
        Math.round((e.clientX - r.left) * 10) / 10,
        Math.round((e.clientY - r.top) * 10) / 10,
      ];
    },
    getScale: () => 1,
  });

  function save() {
    updateCard(card.id, {
      strokes: s.strokesRef.current,
      annW: disp.w,
      annH: disp.h,
    });
    onDone();
  }

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") {
        if (document.querySelector("[data-radix-popper-content-wrapper]"))
          return;
        onDone(); // discard
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
  }, [onDone, s.undo, s.redo, s.deleteSelected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div
        ref={surfRef}
        className={cn(
          "absolute inset-0",
          s.tool === "pen" && "cursor-crosshair",
          s.tool === "eraser" && "cursor-cell",
        )}
        style={{ touchAction: "none" }}
        onPointerDown={s.onPointerDown}
      >
        <svg className="pointer-events-none h-full w-full">
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
          <path
            ref={s.livePathRef}
            stroke={s.color}
            strokeWidth={s.size}
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
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}
        </svg>
      </div>
      {/* toolbar hangs just below the image frame */}
      <div className="absolute top-full left-1/2 mt-4 -translate-x-1/2 whitespace-nowrap">
        <SketchToolbar s={s} onDiscard={onDone} onSave={save} />
      </div>
    </>
  );
}

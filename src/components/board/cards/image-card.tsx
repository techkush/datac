"use client";

import * as React from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { readAsDataURL } from "@/lib/datac/upload";
import { useBoard } from "../store";
import type { ImageCard } from "@/lib/datac/board-types";

export function ImageCardView({ card }: { card: ImageCard }) {
  const { updateCard, client, selection } = useBoard();
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = React.useState(false);

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
    <figure className="flex flex-col">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.src}
        alt={card.caption || ""}
        draggable={false}
        className="w-full rounded-t-lg object-cover"
        style={card.h ? { height: card.h - (showCaption ? 30 : 2) } : undefined}
      />
      {showCaption && (
        <input
          value={card.caption || ""}
          onChange={(e) => updateCard(card.id, { caption: e.target.value })}
          placeholder="Add a caption"
          aria-label="Image caption"
          className="placeholder:text-muted-foreground/70 text-muted-foreground bg-transparent px-2.5 py-1 text-xs outline-none"
        />
      )}
    </figure>
  );
}

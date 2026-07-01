"use client";

import * as React from "react";
import { ImageIcon, Shuffle, Smile, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useEditor } from "./store";
import { COVERS, EMOJIS } from "@/lib/datac/constants";
import { readAsDataURL } from "@/lib/datac/upload";
import { toast } from "sonner";

function coverStyle(val: string): React.CSSProperties {
  if (!val) return {};
  if (val.startsWith("grad:"))
    return { background: COVERS[+val.slice(5)] || COVERS[0] };
  return {
    background: `#222 url("${val}") center/cover no-repeat`,
  };
}

export function PageHead() {
  const { client, meta, setMeta } = useEditor();
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [coverMenuOpen, setCoverMenuOpen] = React.useState(false);
  const coverInput = React.useRef<HTMLInputElement>(null);
  const titleRef = React.useRef<HTMLTextAreaElement>(null);

  const fitTitle = React.useCallback(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  React.useEffect(() => {
    fitTitle();
  }, [meta.title, fitTitle]);

  async function uploadCover(file: File) {
    toast.loading("Uploading cover…", { id: "cover" });
    try {
      const res = await client.upload(file.name, await readAsDataURL(file));
      if (res.url) {
        setMeta({ cover: res.url });
        toast.success("Cover updated", { id: "cover" });
      } else toast.error("Upload failed", { id: "cover" });
    } catch {
      toast.error("Upload failed", { id: "cover" });
    }
  }

  return (
    <div className="w-full">
      {meta.cover && (
        <div
          className="group relative h-44 w-full sm:h-56"
          style={coverStyle(meta.cover)}
        >
          <div className="absolute right-4 bottom-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Popover open={coverMenuOpen} onOpenChange={setCoverMenuOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="secondary" className="h-7">
                  Change cover
                </Button>
              </PopoverTrigger>
              <CoverMenu
                onPick={(v) => {
                  setMeta({ cover: v });
                  setCoverMenuOpen(false);
                }}
                onUpload={() => {
                  coverInput.current?.click();
                  setCoverMenuOpen(false);
                }}
              />
            </Popover>
            <Button
              size="sm"
              variant="secondary"
              className="h-7"
              onClick={() => setMeta({ cover: "" })}
            >
              Remove
            </Button>
          </div>
        </div>
      )}

      <div className="mx-auto w-full max-w-3xl px-6 sm:px-12">
        <div
          className={
            meta.cover ? "relative -mt-8" : "pt-10"
          }
        >
          {meta.icon ? (
            <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
              <PopoverTrigger asChild>
                <button className="hover:bg-accent -ml-1 rounded-md px-1 text-6xl leading-none transition-colors">
                  {meta.icon}
                </button>
              </PopoverTrigger>
              <EmojiMenu
                onPick={(e) => {
                  setMeta({ icon: e });
                  setEmojiOpen(false);
                }}
                onRemove={() => {
                  setMeta({ icon: "" });
                  setEmojiOpen(false);
                }}
              />
            </Popover>
          ) : null}

          <div className="group/tools flex h-7 items-center gap-1 pt-2">
            {!meta.icon && (
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground h-7 opacity-0 group-hover/tools:opacity-100"
                  >
                    <Smile className="size-4" /> Add icon
                  </Button>
                </PopoverTrigger>
                <EmojiMenu
                  onPick={(e) => {
                    setMeta({ icon: e });
                    setEmojiOpen(false);
                  }}
                  onRemove={() => setEmojiOpen(false)}
                />
              </Popover>
            )}
            {!meta.cover && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-7 opacity-0 group-hover/tools:opacity-100"
                onClick={() =>
                  setMeta({
                    cover: "grad:" + Math.floor(Math.random() * COVERS.length),
                  })
                }
              >
                <ImageIcon className="size-4" /> Add cover
              </Button>
            )}
          </div>

          <textarea
            ref={titleRef}
            rows={1}
            spellCheck={false}
            placeholder="Untitled"
            value={meta.title}
            onChange={(e) => {
              setMeta({ title: e.target.value });
              fitTitle();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (
                  document.querySelector(
                    '[data-block-body="true"]',
                  ) as HTMLElement | null
                )?.focus();
              }
            }}
            className="placeholder:text-muted-foreground/40 mt-1 w-full resize-none border-0 bg-transparent p-0 text-4xl font-bold tracking-tight outline-none"
          />
        </div>
      </div>

      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) uploadCover(f);
        }}
      />
    </div>
  );
}

function EmojiMenu({
  onPick,
  onRemove,
}: {
  onPick: (e: string) => void;
  onRemove: () => void;
}) {
  return (
    <PopoverContent className="w-72 p-2" align="start">
      <div className="mb-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => onPick(EMOJIS[Math.floor(Math.random() * EMOJIS.length)])}
        >
          <Shuffle className="size-3.5" /> Random
        </Button>
        <Button variant="ghost" size="sm" className="h-7" onClick={onRemove}>
          <X className="size-3.5" /> Remove
        </Button>
      </div>
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto">
        {EMOJIS.map((e, i) => (
          <button
            key={i}
            onClick={() => onPick(e)}
            className="hover:bg-accent flex size-8 items-center justify-center rounded text-lg"
          >
            {e}
          </button>
        ))}
      </div>
    </PopoverContent>
  );
}

function CoverMenu({
  onPick,
  onUpload,
}: {
  onPick: (v: string) => void;
  onUpload: () => void;
}) {
  return (
    <PopoverContent className="w-64 p-2" align="end">
      <div className="text-muted-foreground mb-1.5 px-1 text-[11px] font-medium uppercase">
        Gradient &amp; color
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {COVERS.map((c, i) => (
          <button
            key={i}
            onClick={() => onPick("grad:" + i)}
            className="hover:ring-ring h-9 rounded-md hover:ring-2"
            style={{ background: c }}
          />
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-full"
        onClick={onUpload}
      >
        <ImageIcon className="size-4" /> Upload image…
      </Button>
    </PopoverContent>
  );
}

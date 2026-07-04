"use client";

import * as React from "react";
import { ExternalLink, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBoard } from "../store";
import { useCardEditing } from "../card-edit-context";
import type { LinkCard } from "@/lib/datac/board-types";

const hostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

// Double-click (shell edit mode) opens the form; the external-link button
// stays live outside edit mode so links open with a single click.
export function LinkCardView({ card }: { card: LinkCard }) {
  const { updateCard } = useBoard();
  const edit = useCardEditing();
  const editing = (edit?.editing ?? false) || !card.url;
  const [title, setTitle] = React.useState(card.title);
  const [url, setUrl] = React.useState(card.url);
  const [iconOk, setIconOk] = React.useState(true);

  // Re-seed the form each time edit mode opens.
  React.useEffect(() => {
    if (editing) {
      setTitle(card.title);
      setUrl(card.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  function commit() {
    const u = url.trim();
    if (!u) return;
    const full = /^[a-z]+:\/\//i.test(u) ? u : `https://${u}`;
    updateCard(card.id, { url: full, title: title.trim() || hostname(full) });
    setIconOk(true);
    edit?.setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 p-3" data-no-drag>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="h-8 text-sm"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape" && card.url) edit?.setEditing(false);
          }}
        />
        <Button size="sm" className="h-7" disabled={!url.trim()} onClick={commit}>
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 p-3">
      {iconOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${hostname(card.url)}&sz=32`}
          alt=""
          className="size-6 shrink-0 rounded"
          draggable={false}
          onError={() => setIconOk(false)}
        />
      ) : (
        <Link2 className="text-muted-foreground size-5 shrink-0" />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{card.title}</span>
        <span className="text-muted-foreground truncate text-xs">
          {hostname(card.url)}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-foreground pointer-events-auto size-7 shrink-0"
        aria-label="Open link in a new tab"
        asChild
      >
        <a href={card.url} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-3.5" />
        </a>
      </Button>
    </div>
  );
}

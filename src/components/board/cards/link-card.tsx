"use client";

import * as React from "react";
import { ExternalLink, Link2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBoard } from "../store";
import type { LinkCard } from "@/lib/datac/board-types";

const hostname = (url: string) => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export function LinkCardView({ card }: { card: LinkCard }) {
  const { updateCard } = useBoard();
  // A freshly added link card has no URL yet — open straight into the form.
  const [editing, setEditing] = React.useState(!card.url);
  const [title, setTitle] = React.useState(card.title);
  const [url, setUrl] = React.useState(card.url);
  const [iconOk, setIconOk] = React.useState(true);

  function commit() {
    const u = url.trim();
    if (!u) return;
    const full = /^[a-z]+:\/\//i.test(u) ? u : `https://${u}`;
    updateCard(card.id, { url: full, title: title.trim() || hostname(full) });
    setEditing(false);
    setIconOk(true);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 p-3" data-no-drag>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="h-8 text-sm"
          autoFocus
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape" && card.url) setEditing(false);
          }}
        />
        <Button size="sm" className="h-7" disabled={!url.trim()} onClick={commit}>
          Save
        </Button>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2.5 p-3">
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
      <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-7"
          aria-label="Edit link"
          onClick={() => {
            setTitle(card.title);
            setUrl(card.url);
            setEditing(true);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-7"
          aria-label="Open link in a new tab"
          asChild
        >
          <a href={card.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

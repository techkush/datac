"use client";

import * as React from "react";
import {
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useBoard } from "../store";
import { useCardEditing } from "../card-edit-context";
import type { HeadingCard } from "@/lib/datac/board-types";
import { cn } from "@/lib/utils";

const LEVEL_STYLE: Record<number, string> = {
  1: "text-3xl font-bold",
  2: "text-2xl font-bold",
  3: "text-xl font-semibold",
  4: "text-lg font-semibold",
  5: "text-base font-semibold",
  6: "text-sm font-semibold tracking-wide uppercase",
};

export function HeadingCardView({ card }: { card: HeadingCard }) {
  const { updateCard } = useBoard();
  const editing = useCardEditing()?.editing ?? false;
  const style = LEVEL_STYLE[card.level] ?? LEVEL_STYLE[2];

  if (editing) {
    return (
      <input
        value={card.text}
        onChange={(e) => updateCard(card.id, { text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape")
            (e.target as HTMLInputElement).blur();
        }}
        placeholder={`Heading ${card.level}`}
        aria-label="Heading text"
        className={cn(
          "placeholder:text-muted-foreground w-full bg-transparent px-3 py-2 outline-none",
          style,
        )}
      />
    );
  }

  const Tag = `h${card.level}` as keyof React.JSX.IntrinsicElements;
  return (
    <Tag
      className={cn("truncate px-3 py-2", style, !card.text && "text-muted-foreground")}
      aria-label="Heading (double-click to edit)"
    >
      {card.text || `Heading ${card.level}`}
    </Tag>
  );
}

// Right-click settings: pick the heading level.
export function HeadingMenuItems({ card }: { card: HeadingCard }) {
  const { updateCard } = useBoard();
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>Heading level</ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-32">
        <ContextMenuRadioGroup
          value={String(card.level)}
          onValueChange={(v) =>
            updateCard(card.id, { level: Number(v) as HeadingCard["level"] })
          }
        >
          {[1, 2, 3, 4, 5, 6].map((l) => (
            <ContextMenuRadioItem key={l} value={String(l)}>
              Heading {l}
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}

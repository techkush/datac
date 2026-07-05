"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBoard } from "../store";
import { useCardEditing } from "../card-edit-context";
import type { ColumnCard } from "@/lib/datac/board-types";
import { NoteText } from "./note-card";

// A collapsible section: centered headline, expand/collapse toggle on the
// right, and a note body (same editor as the note card) when expanded.
export function ColumnCardView({ card }: { card: ColumnCard }) {
  const { updateCard } = useBoard();
  const editing = useCardEditing()?.editing ?? false;
  const expanded = !card.collapsed;

  return (
    <div className="flex flex-col">
      <div className="relative flex items-center px-9 py-2">
        {editing ? (
          <input
            value={card.title}
            onChange={(e) => updateCard(card.id, { title: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Escape")
                (e.target as HTMLInputElement).blur();
            }}
            placeholder="Column"
            aria-label="Column title"
            className="placeholder:text-muted-foreground w-full bg-transparent text-center text-sm font-semibold outline-none"
          />
        ) : (
          <div
            role="heading"
            aria-level={3}
            aria-label="Column title (double-click to edit)"
            className="w-full truncate text-center text-sm font-semibold"
          >
            {card.title || (
              <span className="text-muted-foreground font-normal">Column</span>
            )}
          </div>
        )}
        {/* stays clickable outside edit mode */}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground pointer-events-auto absolute right-1.5 size-6"
          aria-label={expanded ? "Collapse" : "Expand"}
          aria-expanded={expanded}
          onClick={() => updateCard(card.id, { collapsed: expanded })}
        >
          {expanded ? (
            <ChevronUp className="size-4" />
          ) : (
            <ChevronDown className="size-4" />
          )}
        </Button>
      </div>
      {expanded && (
        <div className="border-t">
          <NoteText cardId={card.id} html={card.html || ""} />
        </div>
      )}
    </div>
  );
}

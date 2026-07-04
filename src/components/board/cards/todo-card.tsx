"use client";

import * as React from "react";
import { randomId } from "@/lib/datac/constants";
import { Checkbox } from "@/components/ui/checkbox";
import { useBoard } from "../store";
import type { TodoCard, TodoItem } from "@/lib/datac/board-types";
import { cn } from "@/lib/utils";

export function TodoCardView({ card }: { card: TodoCard }) {
  const { updateCard } = useBoard();
  // Focus the item added by the last Enter press once it exists in the DOM.
  const focusId = React.useRef<string | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLInputElement>());

  React.useEffect(() => {
    if (!focusId.current) return;
    rowRefs.current.get(focusId.current)?.focus();
    focusId.current = null;
  });

  const setItems = (items: TodoItem[]) => updateCard(card.id, { items });

  function insertAfter(idx: number) {
    const item = { id: randomId(), text: "", done: false };
    const items = card.items.slice();
    items.splice(idx + 1, 0, item);
    focusId.current = item.id;
    setItems(items);
  }

  function removeAt(idx: number) {
    const items = card.items.filter((_, i) => i !== idx);
    focusId.current = card.items[idx - 1]?.id ?? null;
    setItems(items);
  }

  return (
    <div className="flex flex-col gap-1 p-3">
      <input
        value={card.title}
        onChange={(e) => updateCard(card.id, { title: e.target.value })}
        placeholder="To-do list"
        aria-label="List title"
        className="placeholder:text-muted-foreground bg-transparent text-sm font-semibold outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") insertAfter(-1);
        }}
      />
      <ul className="flex flex-col gap-1">
        {card.items.map((item, i) => (
          <li key={item.id} className="flex items-center gap-2">
            <Checkbox
              checked={item.done}
              onCheckedChange={(v) =>
                setItems(
                  card.items.map((x) =>
                    x.id === item.id ? { ...x, done: v === true } : x,
                  ),
                )
              }
              aria-label={item.text || "To-do item"}
            />
            <input
              ref={(el) => {
                if (el) rowRefs.current.set(item.id, el);
                else rowRefs.current.delete(item.id);
              }}
              value={item.text}
              onChange={(e) =>
                setItems(
                  card.items.map((x) =>
                    x.id === item.id ? { ...x, text: e.target.value } : x,
                  ),
                )
              }
              placeholder="To-do"
              aria-label="To-do text"
              className={cn(
                "placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none",
                item.done && "text-muted-foreground line-through",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") insertAfter(i);
                else if (e.key === "Backspace" && !item.text && card.items.length > 1) {
                  e.preventDefault();
                  removeAt(i);
                }
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

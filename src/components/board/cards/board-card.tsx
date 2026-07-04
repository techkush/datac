"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBoard } from "../store";
import type { BoardLinkCard } from "@/lib/datac/board-types";

// A card that opens a child board. A fresh card has no boardId yet and shows
// a small inline form: create a new child board or link an existing one.
export function BoardCardView({ card }: { card: BoardLinkCard }) {
  const { ws, boards, updateCard } = useBoard();
  const router = useRouter();
  const summary = boards.find((b) => b.id === card.boardId);

  if (!card.boardId) {
    return <BoardPicker card={card} />;
  }

  return (
    <div
      className="group flex cursor-pointer items-center gap-2.5 p-3"
      onDoubleClick={() => router.push(`/w/${ws}/board/${card.boardId}`)}
    >
      <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md">
        <LayoutDashboard className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {summary ? summary.name : "Missing board"}
        </span>
        <span className="text-muted-foreground text-xs">
          {summary
            ? summary.cardCount
              ? `${summary.cardCount} card${summary.cardCount === 1 ? "" : "s"}`
              : "Empty board"
            : "It may have been deleted"}
        </span>
      </div>
      {summary && (
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          aria-label={`Open ${summary.name}`}
          onClick={() => router.push(`/w/${ws}/board/${card.boardId}`)}
        >
          <ArrowUpRight className="size-4" />
        </Button>
      )}
      {/* keep the picker reachable when the child board is gone */}
      {!summary && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-xs"
          onClick={() => updateCard(card.id, { boardId: "" })}
        >
          Relink
        </Button>
      )}
    </div>
  );
}

function BoardPicker({ card }: { card: BoardLinkCard }) {
  const { boardId, boards, updateCard, createBoard } = useBoard();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // boards that could be linked: everything except the board we're on
  const linkable = boards.filter((b) => b.id !== boardId);

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const id = await createBoard(name, boardId);
    setBusy(false);
    if (id) updateCard(card.id, { boardId: id });
  }

  return (
    <div className="flex flex-col gap-2 p-3" data-no-drag>
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New board name"
          className="h-8 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
        />
        <Button
          size="sm"
          className="h-8"
          disabled={busy || !name.trim()}
          onClick={create}
        >
          Create
        </Button>
      </div>
      {linkable.length > 0 && (
        <Select
          onValueChange={(id) => updateCard(card.id, { boardId: id })}
        >
          <SelectTrigger className="h-8 w-full text-sm">
            <SelectValue placeholder="…or link an existing board" />
          </SelectTrigger>
          <SelectContent>
            {linkable.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

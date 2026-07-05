"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useBoard } from "./store";
import type { BoardSummary } from "@/lib/datac/board-types";

// Home ▸ workspace ▸ …ancestor boards ▸ current (editable name).
export function BoardBreadcrumbs() {
  const { ws, wsTitle, boardId, boardName, boards, renameBoard } = useBoard();

  // Walk parent pointers through the summaries; guard against cycles and
  // parents that no longer resolve (deleted boards act as roots).
  const ancestors = React.useMemo(() => {
    const byId = new Map(boards.map((b) => [b.id, b]));
    const chain: BoardSummary[] = [];
    const seen = new Set<string>([boardId]);
    let parent = byId.get(boardId)?.parent;
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent);
      chain.unshift(byId.get(parent)!);
      parent = byId.get(parent)!.parent;
    }
    return chain;
  }, [boards, boardId]);

  const sep = <ChevronRight className="text-muted-foreground size-3.5 shrink-0" />;

  return (
    <nav
      aria-label="Board breadcrumbs"
      className="flex min-w-0 items-center gap-1.5 text-sm"
    >
      <Link href="/" className="text-muted-foreground hover:text-foreground shrink-0">
        Home
      </Link>
      {sep}
      <Link
        href={`/w/${ws}`}
        className="text-muted-foreground hover:text-foreground max-w-40 shrink-0 truncate"
      >
        {wsTitle}
      </Link>
      {ancestors.map((b) => (
        <React.Fragment key={b.id}>
          {sep}
          <Link
            href={`/w/${ws}/board/${b.id}`}
            className="text-muted-foreground hover:text-foreground max-w-40 truncate"
          >
            {b.name}
          </Link>
        </React.Fragment>
      ))}
      {sep}
      <input
        value={boardName}
        onChange={(e) => renameBoard(e.target.value)}
        onBlur={() => {
          if (!boardName.trim()) renameBoard("Untitled board");
        }}
        aria-label="Board name"
        className="min-w-0 flex-1 bg-transparent font-medium outline-none"
      />
    </nav>
  );
}

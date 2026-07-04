"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BoardFile, BoardSummary } from "@/lib/datac/board-types";
import { BoardProvider, useBoard } from "./store";
import { BoardCanvas } from "./canvas";
import { BoardToolbar } from "./toolbar";
import { BoardBreadcrumbs } from "./breadcrumbs";
import { DrawMode } from "./draw-mode";

export function BoardApp({
  ws,
  info,
  board,
  boards,
}: {
  ws: string;
  info: { title: string; color: string };
  board: BoardFile & { id: string };
  boards: BoardSummary[];
}) {
  return (
    <BoardProvider ws={ws} info={info} board={board} boards={boards}>
      <div className="flex h-svh flex-col">
        <BoardHeader />
        <div className="relative flex flex-1 overflow-hidden">
          <BoardToolbar />
          <BoardCanvas />
          <DrawModeGate />
        </div>
      </div>
    </BoardProvider>
  );
}

// Mount DrawMode only while active so each session starts fresh.
function DrawModeGate() {
  const { drawMode } = useBoard();
  return drawMode ? <DrawMode /> : null;
}

function BoardHeader() {
  const { ws, boardId, boardName, boards, saveState, wsColor, deleteBoard } =
    useBoard();
  const router = useRouter();
  const [confirming, setConfirming] = React.useState(false);
  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
        ? "Save failed"
        : "Saved";

  async function confirmDelete() {
    try {
      await deleteBoard();
      toast.success("Board deleted");
      const parent = boards.find((b) => b.id === boardId)?.parent;
      router.push(
        parent && boards.some((b) => b.id === parent)
          ? `/w/${ws}/board/${parent}`
          : "/",
      );
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <header
      className="bg-background/80 z-10 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur"
      style={wsColor ? { borderBottomColor: wsColor } : undefined}
    >
      <BoardBreadcrumbs />
      <div className="flex shrink-0 items-center gap-1">
        <span
          className={
            saveState === "error"
              ? "text-destructive text-xs"
              : "text-muted-foreground text-xs"
          }
        >
          {saveLabel}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-7"
              aria-label="Board options"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onClick={() => setConfirming(true)}
            >
              <Trash2 className="size-4" /> Delete board
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{boardName}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The board and its cards are removed. Boards nested inside it are
              kept and become top-level boards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
}

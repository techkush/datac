import Link from "next/link";
import { readRegistry, touchOpened, workspaceDir } from "@/lib/datac/registry";
import { getBoard, listBoards } from "@/lib/datac/boards";
import { BoardApp } from "@/components/board/board-app";
import { FocusTracker } from "@/components/workspaces/focus-tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tab title: "DataC | {board name}"
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id, boardId } = await params;
  const dir = await workspaceDir(id);
  const board = dir ? await getBoard(id, dir, boardId) : null;
  return { title: board ? `DataC | ${board.name}` : "DataC Workspace" };
}

export default async function BoardPage({
  params,
}: {
  params: Promise<{ id: string; boardId: string }>;
}) {
  const { id, boardId } = await params;
  const dir = await workspaceDir(id);
  const board = dir ? await getBoard(id, dir, boardId) : null;
  if (!dir || !board) {
    return (
      <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="text-4xl">🗒️</div>
        <h1 className="text-lg font-semibold">
          {dir ? "Unknown board" : "Unknown workspace"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {dir
            ? "This board doesn't exist (it may have been deleted)."
            : "Run datac init in its folder, or pick another workspace."}
        </p>
        <Link href="/" className="text-primary text-sm underline">
          ← All workspaces
        </Link>
      </main>
    );
  }
  await touchOpened(id);
  const reg = await readRegistry();
  const w = reg[id] || {};
  const boards = await listBoards(id, dir);

  return (
    <>
      <FocusTracker ws={id} />
      <BoardApp
        ws={id}
        info={{ title: w.title || "Untitled", color: w.color || "" }}
        board={board}
        boards={boards}
      />
    </>
  );
}

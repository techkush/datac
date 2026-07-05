"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, LayoutDashboard, Plus } from "lucide-react";
import { toast } from "sonner";
import type { BoardSummary } from "@/lib/datac/board-types";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditor } from "./store";
import { STATUSES, statusInfo } from "@/lib/datac/constants";
import { cn } from "@/lib/utils";

function SaveStatus({ state }: { state: string }) {
  const label =
    state === "saving"
      ? "Saving…"
      : state === "error"
        ? "Save failed"
        : "Saved";
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        state === "error"
          ? "text-destructive"
          : state === "saving"
            ? "text-muted-foreground"
            : "text-muted-foreground/70",
      )}
    >
      {label}
    </span>
  );
}

// Quick access to this workspace's visual boards: list (fetched lazily when
// the menu opens) plus "New board", which creates and navigates straight in.
function BoardsMenu() {
  const { client } = useEditor();
  const router = useRouter();
  const [boards, setBoards] = React.useState<BoardSummary[] | null>(null);

  async function load(open: boolean) {
    if (!open) return;
    try {
      setBoards(await client.listBoards());
    } catch {
      setBoards([]);
    }
  }

  async function newBoard() {
    try {
      const created = await client.createBoard({ name: "Untitled board" });
      // fetch().json() resolves on HTTP errors — the payload is {error}
      if (!created.id) throw new Error();
      router.push(`/w/${client.ws}/board/${created.id}`);
    } catch {
      toast.error("Could not create board");
    }
  }

  return (
    <DropdownMenu onOpenChange={load}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          title="Visual boards"
        >
          <LayoutDashboard className="size-4" /> Boards
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {boards === null ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : (
          boards
            .filter((b) => !b.parent)
            .map((b) => (
              <DropdownMenuItem
                key={b.id}
                onClick={() => router.push(`/w/${client.ws}/board/${b.id}`)}
              >
                <LayoutDashboard className="size-4" />
                <span className="truncate">{b.name}</span>
              </DropdownMenuItem>
            ))
        )}
        <DropdownMenuItem onClick={newBoard}>
          <Plus className="size-4" /> New board
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const { docs, currentId, meta, saveState, openDoc, setMeta, exportMarkdown } =
    useEditor();

  // breadcrumb: walk up the parent chain
  const chain: { id: string; title: string }[] = [];
  let pid = meta.parent;
  let guard = 30;
  while (pid && guard-- > 0) {
    const p = docs.find((d) => d.id === pid);
    if (!p) break;
    chain.unshift({ id: p.id, title: p.title || "Untitled" });
    pid = p.parent;
  }

  const st = statusInfo(meta.status);

  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b px-3 backdrop-blur">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 !h-5" />

      <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
        {chain.map((c) => (
          <React.Fragment key={c.id}>
            <button
              onClick={() => openDoc(c.id)}
              className="text-muted-foreground hover:text-foreground max-w-40 truncate"
            >
              {c.title}
            </button>
            <span className="text-muted-foreground/40">/</span>
          </React.Fragment>
        ))}
        {currentId && (
          <span className="max-w-64 truncate font-medium">
            {meta.title || "Untitled"}
          </span>
        )}
      </nav>

      <div className="flex items-center gap-2">
        <BoardsMenu />
        {currentId && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: st.color }}
                  />
                  {st.label}
                  <ChevronDown className="size-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s.key}
                    onClick={() => setMeta({ status: s.key })}
                  >
                    <span
                      className="size-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => exportMarkdown()}
              title="Export as Markdown (includes sub-pages)"
            >
              <Download className="size-4" /> Export
            </Button>
            <Separator orientation="vertical" className="!h-5" />
            <SaveStatus state={saveState} />
          </>
        )}
      </div>
    </header>
  );
}

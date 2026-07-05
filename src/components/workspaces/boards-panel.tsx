"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BoardSummary } from "@/lib/datac/board-types";

export interface BoardsPanelWorkspace {
  id: string;
  title: string;
  color: string;
  boards: BoardSummary[];
}

export function BoardsPanel({ initial }: { initial: BoardsPanelWorkspace[] }) {
  // null = closed, otherwise the workspace to create a board in
  const [creating, setCreating] = React.useState<BoardsPanelWorkspace | null>(
    null,
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="text-muted-foreground size-3.5" />
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Visual boards
        </h2>
      </div>

      {!initial.length ? (
        <p className="text-muted-foreground text-xs">
          No workspaces yet — boards live inside a workspace.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          {initial.map((w) => (
            <div key={w.id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: w.color || "var(--border)" }}
                    aria-hidden
                  />
                  <span className="truncate">{w.title}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-6"
                  aria-label={`New board in ${w.title}`}
                  onClick={() => setCreating(w)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
              {/* only root boards here — nested boards are reached from their parent */}
              {w.boards.filter((b) => !b.parent).length > 0 && (
                <ul className="flex flex-col gap-1">
                  {w.boards
                    .filter((b) => !b.parent)
                    .map((b) => (
                      <li key={b.id}>
                        <Card className="group p-0 transition-colors hover:border-foreground/20">
                          <Link
                            href={`/w/${w.id}/board/${b.id}`}
                            className="flex flex-col px-2.5 py-2"
                          >
                            <span className="truncate text-sm font-medium">
                              {b.name}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {b.cardCount
                                ? `${b.cardCount} card${b.cardCount === 1 ? "" : "s"}`
                                : "Empty board"}
                            </span>
                          </Link>
                        </Card>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <NewBoardDialog
        key={creating?.id ?? "closed"}
        ws={creating}
        onClose={() => setCreating(null)}
      />
    </section>
  );
}

function NewBoardDialog({
  ws,
  onClose,
}: {
  ws: BoardsPanelWorkspace | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!ws || !name.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/w/${ws.id}/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error || "Could not create board");
        return;
      }
      const created = (await r.json()) as { id: string };
      router.push(`/w/${ws.id}/board/${created.id}`);
    } catch {
      toast.error("Could not create board");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!ws} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New board</DialogTitle>
          <DialogDescription>
            A visual canvas in {ws?.title ?? "this workspace"} for notes,
            images, links and more.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="nb-name">Name</Label>
          <Input
            id="nb-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Moodboard"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") create();
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={busy || !name.trim()} onClick={create}>
            {busy ? "Creating…" : "Create board"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

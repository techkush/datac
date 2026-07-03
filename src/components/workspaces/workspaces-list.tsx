"use client";

import * as React from "react";
import Link from "next/link";
import {
  BarChart3,
  FolderOpen,
  RotateCcw,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDuration, formatOpened } from "@/lib/datac/format";
import { StatsPanel } from "@/components/workspaces/stats-panel";

export interface WorkspaceRow {
  id: string;
  title: string;
  folderName: string;
  opened: string;
  focusSeconds: number;
  trashed: boolean;
}

function IconAction({
  label,
  onClick,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={
            destructive
              ? "text-muted-foreground hover:text-destructive size-8 shrink-0"
              : "text-muted-foreground hover:text-foreground size-8 shrink-0"
          }
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkspacesList({ initial }: { initial: WorkspaceRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [statsTarget, setStatsTarget] = React.useState<WorkspaceRow | null>(
    null,
  );
  const [trashTarget, setTrashTarget] = React.useState<WorkspaceRow | null>(
    null,
  );
  const [foreverTarget, setForeverTarget] =
    React.useState<WorkspaceRow | null>(null);

  const active = rows.filter((w) => !w.trashed);
  const trash = rows.filter((w) => w.trashed);

  async function setTrashed(w: WorkspaceRow, on: boolean) {
    try {
      const r = await fetch(`/api/workspaces/${w.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: on ? "trash" : "restore" }),
      });
      if (!r.ok) throw new Error();
      setRows((rs) =>
        rs.map((x) => (x.id === w.id ? { ...x, trashed: on } : x)),
      );
      toast.success(
        on ? `Moved “${w.title}” to trash` : `Restored “${w.title}”`,
      );
    } catch {
      toast.error(on ? "Move to trash failed" : "Restore failed");
    }
  }

  async function openFolder(w: WorkspaceRow) {
    try {
      const r = await fetch(`/api/w/${w.id}/reveal`, { method: "POST" });
      if (!r.ok) throw new Error();
    } catch {
      toast.error("Could not open the project folder");
    }
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Workspaces
        </h2>

        {!active.length ? (
          <p className="text-muted-foreground text-xs">
            No workspaces yet — run{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono">
              datac init
            </code>{" "}
            in a project folder.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {active.map((w) => (
              <li key={w.id}>
                <Card className="group flex-row items-center gap-2 p-3.5 transition-colors">
                  <Link
                    href={`/w/${w.id}`}
                    className="flex min-w-0 flex-1 flex-col gap-0.5"
                  >
                    <span className="truncate text-base font-semibold">
                      {w.title}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {formatOpened(w.opened)} ·{" "}
                      {formatDuration(w.focusSeconds)} focus
                    </span>
                  </Link>
                  <IconAction
                    label="Open project folder"
                    onClick={() => openFolder(w)}
                  >
                    <FolderOpen className="size-4" />
                  </IconAction>
                  <IconAction
                    label="Statistics"
                    onClick={() => setStatsTarget(w)}
                  >
                    <BarChart3 className="size-4" />
                  </IconAction>
                  <IconAction
                    label="Move to trash"
                    destructive
                    onClick={() => setTrashTarget(w)}
                  >
                    <Trash2 className="size-4" />
                  </IconAction>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      {trash.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Trash2 className="size-3.5" /> Trash
          </h2>
          <ul className="flex flex-col gap-2">
            {trash.map((w) => (
              <li key={w.id}>
                <Card className="flex-row items-center gap-2 p-3.5 opacity-75">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-base font-semibold">
                      {w.title}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {formatOpened(w.opened)} ·{" "}
                      {formatDuration(w.focusSeconds)} focus
                    </span>
                  </div>
                  <IconAction
                    label="Restore"
                    onClick={() => setTrashed(w, false)}
                  >
                    <RotateCcw className="size-4" />
                  </IconAction>
                  <IconAction
                    label="Delete forever"
                    destructive
                    onClick={() => setForeverTarget(w)}
                  >
                    <Trash2 className="size-4" />
                  </IconAction>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AlertDialog
        open={!!trashTarget}
        onOpenChange={(o) => !o && setTrashTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move “{trashTarget?.title}” to trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It goes to the Trash section below the workspace list — nothing
              on disk changes, and you can restore it anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (trashTarget) setTrashed(trashTarget, true);
                setTrashTarget(null);
              }}
            >
              Move to trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteForeverDialog
        key={foreverTarget?.id ?? "closed"}
        target={foreverTarget}
        onClose={() => setForeverTarget(null)}
        onDeleted={(id) => setRows((rs) => rs.filter((x) => x.id !== id))}
      />

      <StatsPanel
        target={statsTarget}
        onClose={() => setStatsTarget(null)}
      />
    </>
  );
}

// "Delete forever" removes only the entry from this list — nothing on disk.
// The user must type the project folder's name to confirm.
function DeleteForeverDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: WorkspaceRow | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  // Fresh state per target via the `key` prop on this dialog.
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const match = !!target && typed.trim() === target.folderName;

  async function confirm() {
    if (!target || !match) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/workspaces/${target.id}`, {
        method: "DELETE",
      });
      if (!r.ok) throw new Error();
      onDeleted(target.id);
      toast.success(`Removed “${target.title}” from workspaces`);
      onClose();
    } catch {
      toast.error("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="text-destructive size-5" /> Delete
            “{target?.title}” forever?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-col gap-2">
              <span>
                This only removes the workspace from this list. Nothing is
                deleted from your disk — the project folder, its notes and{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  open.dc
                </code>{" "}
                stay where they are. Opening{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  open.dc
                </code>{" "}
                again adds it back.
              </span>
              <span>
                Type the folder name{" "}
                <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
                  {target?.folderName}
                </code>{" "}
                to confirm.
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={target?.folderName}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") confirm();
          }}
        />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!match || busy}
            onClick={confirm}
          >
            {busy ? "Deleting…" : "Delete forever"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { FolderOpen, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export interface WorkspaceRow {
  id: string;
  title: string;
  projectDir: string;
}

export function WorkspacesList({ initial }: { initial: WorkspaceRow[] }) {
  const [rows, setRows] = React.useState(initial);
  const [target, setTarget] = React.useState<WorkspaceRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function confirmDelete() {
    if (!target) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/workspaces/${target.id}`, {
        method: "DELETE",
      });
      if (r.ok) {
        setRows((rs) => rs.filter((x) => x.id !== target.id));
        toast.success(`Deleted “${target.title}”`);
      } else {
        toast.error("Delete failed");
      }
    } catch {
      toast.error("Delete failed");
    } finally {
      setBusy(false);
      setTarget(null);
    }
  }

  if (!rows.length) {
    return (
      <Card className="text-muted-foreground border-dashed p-8 text-center text-sm">
        No workspaces yet. Run{" "}
        <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
          datac init
        </code>{" "}
        in a project folder.
      </Card>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-2">
        {rows.map((w) => (
          <li key={w.id}>
            <Card className="flex-row items-center gap-3 p-3.5 transition-colors">
              <Link
                href={`/w/${w.id}`}
                className="flex min-w-0 flex-1 flex-col gap-0.5"
              >
                <span className="truncate text-base font-semibold">
                  {w.title || "Untitled"}
                </span>
                <span className="text-muted-foreground truncate font-mono text-xs">
                  {w.projectDir}
                </span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive shrink-0"
                onClick={() => setTarget(w)}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </Card>
          </li>
        ))}
      </ul>

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <FolderOpen className="size-5" /> Delete “{target?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes its dataC notes and clears it from this
              list. The project folder is kept unless it becomes empty. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={busy}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {busy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

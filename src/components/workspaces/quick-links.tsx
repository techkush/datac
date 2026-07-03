"use client";

import * as React from "react";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
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
import type { QuickLink } from "@/lib/datac/types";

export function QuickLinks({ initial }: { initial: QuickLink[] }) {
  const [links, setLinks] = React.useState(initial);
  // null = closed, "new" = add dialog, otherwise the link being edited
  const [editing, setEditing] = React.useState<QuickLink | "new" | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Quick links
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-7"
          aria-label="Add quick link"
          onClick={() => setEditing("new")}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {!links.length ? (
        <p className="text-muted-foreground text-xs">
          No links yet — add one with the + button.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {links.map((l) => (
            <li key={l.id}>
              <Card className="group flex-row items-center gap-1 p-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {l.title}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {l.url}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-7 shrink-0"
                  aria-label={`Edit ${l.title}`}
                  onClick={() => setEditing(l)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-7 shrink-0"
                  aria-label={`Open ${l.title} in a new tab`}
                  asChild
                >
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <LinkDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(link, isNew) =>
          setLinks((ls) =>
            isNew ? [...ls, link] : ls.map((x) => (x.id === link.id ? link : x)),
          )
        }
        onDeleted={(id) => setLinks((ls) => ls.filter((x) => x.id !== id))}
      />
    </section>
  );
}

function LinkDialog({
  editing,
  onClose,
  onSaved,
  onDeleted,
}: {
  editing: QuickLink | "new" | null;
  onClose: () => void;
  onSaved: (link: QuickLink, isNew: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = editing === "new";
  // Fresh state per link via the `key` prop on this dialog.
  const [title, setTitle] = React.useState(
    isNew || !editing ? "" : editing.title,
  );
  const [url, setUrl] = React.useState(isNew || !editing ? "" : editing.url);
  const [busy, setBusy] = React.useState(false);

  async function save() {
    if (!editing || !title.trim() || !url.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/quicklinks", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew
            ? { title, url }
            : { id: (editing as QuickLink).id, title, url },
        ),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error || "Save failed");
        return;
      }
      onSaved((await r.json()) as QuickLink, isNew);
      onClose();
    } catch {
      toast.error("Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing || isNew) return;
    setBusy(true);
    try {
      const r = await fetch("/api/quicklinks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: (editing as QuickLink).id }),
      });
      if (!r.ok) throw new Error();
      onDeleted((editing as QuickLink).id);
      onClose();
    } catch {
      toast.error("Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add quick link" : "Edit quick link"}</DialogTitle>
          <DialogDescription>
            A title and the web address to open.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ql-title">Title</Label>
            <Input
              id="ql-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Team dashboard"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ql-url">URL</Label>
            <Input
              id="ql-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
              }}
            />
          </div>
        </div>
        <DialogFooter className={isNew ? "" : "sm:justify-between"}>
          {!isNew && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={remove}
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy || !title.trim() || !url.trim()}
              onClick={save}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

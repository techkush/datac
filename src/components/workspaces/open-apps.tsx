"use client";

import * as React from "react";
import { icons, AppWindow, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import type { OpenApp } from "@/lib/datac/types";

const ICON_NAMES = Object.keys(icons) as Array<keyof typeof icons>;
// How many icons/apps to render at once in the picker grids.
const GRID_LIMIT = 240;

// A lucide icon by its saved name, with a generic fallback.
function LucideIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const I = icons[name as keyof typeof icons] ?? AppWindow;
  return <I className={className} />;
}

export function OpenApps({ initial }: { initial: OpenApp[] }) {
  const [apps, setApps] = React.useState(initial);
  // null = closed, "new" = add dialog, otherwise the launcher being edited
  const [editing, setEditing] = React.useState<OpenApp | "new" | null>(null);

  async function launch(app: OpenApp) {
    try {
      const r = await fetch("/api/apps/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: app.id }),
      });
      const d = (await r.json()) as { ok?: boolean };
      if (!d.ok) throw new Error();
    } catch {
      toast.error(`Could not open ${app.title}`);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Open apps
        </h2>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground size-7"
          aria-label="Add app"
          onClick={() => setEditing("new")}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      {!apps.length ? (
        <p className="text-muted-foreground text-xs">
          No apps yet — add one with the + button.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {apps.map((a) => (
            <li key={a.id} className="flex items-center gap-1">
              <Button
                variant="outline"
                className="min-w-0 flex-1 justify-start"
                onClick={() => launch(a)}
              >
                <LucideIcon name={a.icon} className="size-4" />
                <span className="truncate">{a.title}</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground size-7 shrink-0"
                aria-label={`Edit ${a.title}`}
                onClick={() => setEditing(a)}
              >
                <Pencil className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AppDialog
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(app, isNew) =>
          setApps((as) =>
            isNew ? [...as, app] : as.map((x) => (x.id === app.id ? app : x)),
          )
        }
        onDeleted={(id) => setApps((as) => as.filter((x) => x.id !== id))}
      />
    </section>
  );
}

// Searchable grid over the whole lucide icon library.
function IconPicker({
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: string;
  onSelect: (name: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? ICON_NAMES.filter((n) => n.toLowerCase().includes(q))
    : ICON_NAMES;
  const shown = matches.slice(0, GRID_LIMIT);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Choose an icon</DialogTitle>
          <DialogDescription>
            {matches.length.toLocaleString()} lucide icons
            {matches.length > shown.length
              ? ` — showing ${shown.length}, type to narrow down`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search icons…"
          autoFocus
        />
        <div className="grid max-h-72 grid-cols-8 gap-1 overflow-y-auto pr-1">
          {shown.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              className={cn(
                "hover:bg-accent flex aspect-square items-center justify-center rounded-md",
                value === name && "bg-accent ring-primary ring-1",
              )}
              onClick={() => {
                onSelect(name);
                onOpenChange(false);
              }}
            >
              <LucideIcon name={name} className="size-4.5" />
            </button>
          ))}
          {!shown.length && (
            <p className="text-muted-foreground col-span-8 py-8 text-center text-sm">
              No icon matches “{query}”.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// One app tile: real macOS icon with a generic fallback while loading/missing.
function AppTile({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const [failed, setFailed] = React.useState(false);
  return (
    <button
      type="button"
      title={name}
      className={cn(
        "hover:bg-accent flex flex-col items-center gap-1.5 rounded-lg p-2",
        selected && "bg-accent ring-primary ring-1",
      )}
      onClick={onSelect}
    >
      {failed ? (
        <AppWindow className="text-muted-foreground size-10" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/apps/icon/${encodeURIComponent(name)}`}
          alt=""
          className="size-10"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
      <span className="w-full truncate text-center text-xs">{name}</span>
    </button>
  );
}

// Grid of all installed system apps with their real icons.
function AppPicker({
  open,
  onOpenChange,
  value,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  value: string;
  onSelect: (app: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [list, setList] = React.useState<string[] | null>(null);

  React.useEffect(() => {
    if (!open || list !== null) return;
    fetch("/api/apps")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { apps: string[] }) => setList(d.apps))
      .catch(() => {
        setList([]);
        toast.error("Could not list installed apps");
      });
  }, [open, list]);

  const q = query.trim().toLowerCase();
  const matches = (list || []).filter(
    (n) => !q || n.toLowerCase().includes(q),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a system app</DialogTitle>
          <DialogDescription>
            {list === null
              ? "Loading installed applications…"
              : `${matches.length} of ${list.length} installed apps`}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search apps…"
          autoFocus
        />
        <div className="grid max-h-80 grid-cols-4 content-start gap-1 overflow-y-auto pr-1 sm:grid-cols-5">
          {matches.slice(0, GRID_LIMIT).map((name) => (
            <AppTile
              key={name}
              name={name}
              selected={value === name}
              onSelect={() => {
                onSelect(name);
                onOpenChange(false);
              }}
            />
          ))}
          {list !== null && !matches.length && (
            <p className="text-muted-foreground col-span-full py-8 text-center text-sm">
              No app matches “{query}”.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppDialog({
  editing,
  onClose,
  onSaved,
  onDeleted,
}: {
  editing: OpenApp | "new" | null;
  onClose: () => void;
  onSaved: (app: OpenApp, isNew: boolean) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = editing === "new";
  // Fresh state per launcher via the `key` prop on this dialog.
  const [title, setTitle] = React.useState(
    isNew || !editing ? "" : editing.title,
  );
  const [icon, setIcon] = React.useState(
    isNew || !editing ? "AppWindow" : editing.icon,
  );
  const [app, setApp] = React.useState(isNew || !editing ? "" : editing.app);
  const [busy, setBusy] = React.useState(false);
  const [pickIcon, setPickIcon] = React.useState(false);
  const [pickApp, setPickApp] = React.useState(false);

  async function save() {
    if (!editing || !title.trim() || !app.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/openapps", {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isNew
            ? { title, icon, app }
            : { id: (editing as OpenApp).id, title, icon, app },
        ),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        toast.error(err.error || "Save failed");
        return;
      }
      onSaved((await r.json()) as OpenApp, isNew);
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
      const r = await fetch("/api/openapps", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: (editing as OpenApp).id }),
      });
      if (!r.ok) throw new Error();
      onDeleted((editing as OpenApp).id);
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
          <DialogTitle>{isNew ? "Add app" : "Edit app"}</DialogTitle>
          <DialogDescription>
            A title, an icon and the system app to launch.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <Button
                variant="outline"
                size="icon"
                aria-label="Choose icon"
                onClick={() => setPickIcon(true)}
              >
                <LucideIcon name={icon} className="size-4.5" />
              </Button>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="oa-title">Title</Label>
              <Input
                id="oa-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mail"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                }}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>System app</Label>
            <Button
              variant="outline"
              className="justify-start font-normal"
              onClick={() => setPickApp(true)}
            >
              <span
                className={cn("truncate", !app && "text-muted-foreground")}
              >
                {app || "Select a system app…"}
              </span>
            </Button>
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
              disabled={busy || !title.trim() || !app.trim()}
              onClick={save}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>

        <IconPicker
          open={pickIcon}
          onOpenChange={setPickIcon}
          value={icon}
          onSelect={setIcon}
        />
        <AppPicker
          open={pickApp}
          onOpenChange={setPickApp}
          value={app}
          onSelect={(name) => {
            setApp(name);
            if (!title.trim()) setTitle(name);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

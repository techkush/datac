"use client";

// Page icons are lucide icon names (e.g. "GraduationCap"). Docs saved
// before the switch may still hold an emoji — those render as text.

import * as React from "react";
import { icons, FileText, Shuffle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ICON_NAMES = Object.keys(icons) as Array<keyof typeof icons>;
const GRID_LIMIT = 240;

export function PageIcon({
  name,
  className,
}: {
  name: string | undefined;
  className?: string;
}) {
  const I = icons[name as keyof typeof icons];
  if (I) return <I className={className} />;
  // Legacy emoji icon: inherits the parent's font size.
  if (name) return <span className="leading-none">{name}</span>;
  return <FileText className={className} />;
}

// Searchable grid over the lucide library with Random / Remove actions.
// Rendered inside a Popover/Dialog by the caller.
export function LucideIconGrid({
  value,
  onPick,
  onRemove,
}: {
  value?: string;
  onPick: (name: string) => void;
  onRemove?: () => void;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const matches = q
    ? ICON_NAMES.filter((n) => n.toLowerCase().includes(q))
    : ICON_NAMES;
  const shown = matches.slice(0, GRID_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${ICON_NAMES.length.toLocaleString()} icons…`}
          className="h-8 flex-1"
          autoFocus
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Random icon"
          onClick={() =>
            onPick(ICON_NAMES[Math.floor(Math.random() * ICON_NAMES.length)])
          }
        >
          <Shuffle className="size-3.5" />
        </Button>
        {onRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Remove icon"
            onClick={onRemove}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      <div className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto pr-1">
        {shown.map((name) => {
          const I = icons[name];
          return (
            <button
              key={name}
              type="button"
              title={name}
              className={
                value === name
                  ? "bg-accent ring-primary flex size-8 items-center justify-center rounded ring-1"
                  : "hover:bg-accent flex size-8 items-center justify-center rounded"
              }
              onClick={() => onPick(name)}
            >
              <I className="size-4" />
            </button>
          );
        })}
        {!shown.length && (
          <p className="text-muted-foreground col-span-8 py-6 text-center text-xs">
            No icon matches “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}

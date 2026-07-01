"use client";

import * as React from "react";
import { ChevronDown, Download } from "lucide-react";
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

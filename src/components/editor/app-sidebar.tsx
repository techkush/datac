"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { useEditor } from "./store";
import { statusInfo } from "@/lib/datac/constants";
import type { DocSummary } from "@/lib/datac/types";
import { toast } from "sonner";

function isOrphan(d: DocSummary, docs: DocSummary[]) {
  return d.orphaned || (!!d.parent && !docs.some((x) => x.id === d.parent));
}

export function AppSidebar() {
  const {
    client,
    projectTitle,
    projectDir,
    docs,
    currentId,
    openDoc,
    newDoc,
    deleteDoc,
    duplicateDoc,
    renameDoc,
    restorePage,
    reattachPage,
    exportMarkdown,
  } = useEditor();

  const [collapsed, setCollapsed] = React.useState<Set<string>>(new Set());
  const [renameTarget, setRenameTarget] = React.useState<DocSummary | null>(
    null,
  );
  const [renameValue, setRenameValue] = React.useState("");
  const [deleteTarget, setDeleteTarget] = React.useState<DocSummary | null>(
    null,
  );

  const wsKey = `datac:collapsed:${client.ws}`;
  React.useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(wsKey) || "[]");
      setCollapsed(new Set(saved));
    } catch {}
  }, [wsKey]);

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(wsKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  // children map (non-orphan sub-pages), ordered by parent's childOrder
  const kids: Record<string, DocSummary[]> = {};
  docs.forEach((d) => {
    if (d.parent && !d.orphaned && docs.some((x) => x.id === d.parent))
      (kids[d.parent] ||= []).push(d);
  });
  Object.keys(kids).forEach((pid) => {
    const order = docs.find((d) => d.id === pid)?.childOrder || [];
    kids[pid].sort((a, b) => {
      const ia = order.indexOf(a.id),
        ib = order.indexOf(b.id);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
  });
  const roots = docs
    .filter((d) => !d.parent && !d.orphaned)
    .sort((a, b) => String(a.created || "").localeCompare(String(b.created || "")));
  const orphans = docs.filter((d) => isOrphan(d, docs));

  // keep active page's ancestors expanded
  const forcedOpen = new Set<string>();
  let pid = docs.find((d) => d.id === currentId)?.parent;
  let guard = 30;
  while (pid && guard-- > 0) {
    forcedOpen.add(pid);
    pid = docs.find((d) => d.id === pid)?.parent;
  }

  const startRename = (d: DocSummary) => {
    setRenameTarget(d);
    setRenameValue(d.title || "");
  };
  const commitRename = () => {
    if (renameTarget) renameDoc(renameTarget.id, renameValue.trim() || "Untitled");
    setRenameTarget(null);
  };

  const renderNode = (d: DocSummary, depth: number, orphan: boolean) => {
    const children = kids[d.id] || [];
    const hasKids = children.length > 0;
    const isCollapsed = collapsed.has(d.id) && !forcedOpen.has(d.id);
    const st = statusInfo(d.status);
    const hasParent = !!d.parent && docs.some((x) => x.id === d.parent);
    return (
      <React.Fragment key={d.id}>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={d.id === currentId}
            onClick={() => openDoc(d.id)}
            className="group/item pr-1"
            style={{ paddingLeft: 8 + depth * 12 }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (hasKids) toggleCollapse(d.id);
              }}
              className="text-muted-foreground hover:text-foreground -ml-1 flex size-4 shrink-0 items-center justify-center rounded"
            >
              {hasKids ? (
                isCollapsed ? (
                  <ChevronRight className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )
              ) : null}
            </button>
            <span className="shrink-0 text-[13px] leading-none">
              {d.icon || "📄"}
            </span>
            <span className="flex-1 truncate">{d.title || "Untitled"}</span>
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: st.color }}
              title={st.label}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => e.stopPropagation()}
                  className="text-muted-foreground hover:bg-sidebar-accent hover:text-foreground flex size-5 shrink-0 items-center justify-center rounded opacity-0 group-hover/item:opacity-100 data-[state=open]:opacity-100"
                >
                  <MoreHorizontal className="size-4" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="right">
                {orphan && hasParent && (
                  <DropdownMenuItem onClick={() => reattachPage(d.id)}>
                    <Undo2 /> Re-add to parent
                  </DropdownMenuItem>
                )}
                {orphan && (
                  <DropdownMenuItem onClick={() => restorePage(d.id)}>
                    <RotateCcw /> Restore to top level
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => startRename(d)}>
                  <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicateDoc(d.id)}>
                  <Copy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportMarkdown(d.id)}>
                  <Download /> Export Markdown
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteTarget(d)}
                >
                  <Trash2 /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {hasKids &&
          !isCollapsed &&
          children.map((c) => renderNode(c, depth + 1, false))}
      </React.Fragment>
    );
  };

  return (
    <Sidebar>
      <SidebarHeader className="gap-3">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-primary text-base leading-none">◆</span>
            <span className="truncate text-sm font-semibold">
              {projectTitle || "Notes"}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={async () => {
                    await client.reveal();
                    toast.info("Opening project folder…");
                  }}
                >
                  <FolderOpen className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{projectDir || "Open project folder"}</TooltipContent>
            </Tooltip>
            <ThemeToggle />
          </div>
        </div>
        <Button size="sm" className="w-full justify-start" onClick={newDoc}>
          <Plus className="size-4" /> New page
        </Button>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SidebarMenu>
          {roots.length ? (
            roots.map((d) => renderNode(d, 0, false))
          ) : (
            <div className="text-muted-foreground px-3 py-2 text-xs">
              No pages yet
            </div>
          )}
        </SidebarMenu>
        {orphans.length > 0 && (
          <>
            <div className="text-muted-foreground mt-3 px-3 pb-1 text-[11px] font-medium uppercase tracking-wide">
              Orphaned pages
            </div>
            <SidebarMenu>
              {orphans.map((d) => renderNode(d, 0, true))}
            </SidebarMenu>
          </>
        )}
      </SidebarContent>

      <SidebarFooter>
        <span className="text-muted-foreground px-2 text-[11px]">
          datac · {docs.length} page{docs.length === 1 ? "" : "s"}
        </span>
      </SidebarFooter>

      {/* Rename dialog */}
      <Dialog
        open={!!renameTarget}
        onOpenChange={(o) => !o && setRenameTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={commitRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{deleteTarget?.title || "this page"}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) deleteDoc(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}

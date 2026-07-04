"use client";

import * as React from "react";
import { ArrowUpRight, FileText, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { PageIcon } from "@/components/page-icon";
import type { DocSummary } from "@/lib/datac/types";
import type { PageCard } from "@/lib/datac/board-types";
import type { FullDoc } from "@/lib/datac/client";
import { useBoard } from "../store";
import { useCardEditing } from "../card-edit-context";
import { cn } from "@/lib/utils";

/* ---- read-only block rendering ------------------------------------------- */
// Compact renderer for BlockNote-format blocks (plus legacy html blocks) —
// enough to READ a page in the side panel; editing happens in the editor.
interface AnyBlock {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: AnyBlock[];
  html?: string;
}

function runsToText(content: unknown): React.ReactNode {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return null;
  return content.map((r, i) => {
    const run = r as {
      type?: string;
      text?: string;
      href?: string;
      content?: unknown;
      styles?: Record<string, unknown>;
    };
    if (run.type === "link")
      return (
        <a
          key={i}
          href={run.href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline"
        >
          {runsToText(run.content)}
        </a>
      );
    const s = run.styles || {};
    return (
      <span
        key={i}
        className={cn(
          s.bold ? "font-semibold" : undefined,
          s.italic ? "italic" : undefined,
          s.underline ? "underline" : undefined,
          s.strike ? "line-through" : undefined,
          s.code ? "bg-muted rounded px-1 font-mono text-[0.9em]" : undefined,
        )}
      >
        {run.text ?? ""}
      </span>
    );
  });
}

function BlockView({ b, depth = 0 }: { b: AnyBlock; depth?: number }) {
  const kids = Array.isArray(b.children) && b.children.length > 0 && (
    <div className="ml-4">
      {b.children.map((c, i) => (
        <BlockView key={c.id ?? i} b={c} depth={depth + 1} />
      ))}
    </div>
  );
  // legacy block format stored inline HTML
  if (b.html !== undefined && b.content === undefined) {
    return (
      <>
        <div
          className="py-0.5 text-[15px] leading-relaxed"
          dangerouslySetInnerHTML={{ __html: b.html }}
        />
        {kids}
      </>
    );
  }
  const text = runsToText(b.content);
  switch (b.type) {
    case "heading": {
      const level = Number(b.props?.level ?? 2);
      const cls =
        level <= 1
          ? "mt-5 text-3xl font-bold"
          : level === 2
            ? "mt-4 text-2xl font-bold"
            : "mt-3 text-xl font-semibold";
      return (
        <>
          <div className={cls}>{text}</div>
          {kids}
        </>
      );
    }
    case "bulletListItem":
      return (
        <>
          <div className="flex gap-2 py-0.5 text-[15px] leading-relaxed">
            <span className="text-muted-foreground">•</span>
            <span>{text}</span>
          </div>
          {kids}
        </>
      );
    case "numberedListItem":
      return (
        <>
          <div className="flex gap-2 py-0.5 text-[15px] leading-relaxed">
            <span className="text-muted-foreground">–</span>
            <span>{text}</span>
          </div>
          {kids}
        </>
      );
    case "checkListItem":
      return (
        <>
          <div className="flex gap-2 py-0.5 text-[15px] leading-relaxed">
            <span>{b.props?.checked ? "☑" : "☐"}</span>
            <span className={b.props?.checked ? "text-muted-foreground line-through" : ""}>
              {text}
            </span>
          </div>
          {kids}
        </>
      );
    case "codeBlock":
      return (
        <>
          <pre className="bg-muted my-1 overflow-x-auto rounded-md p-2 font-mono text-xs">
            {typeof text === "string" ? text : text}
          </pre>
          {kids}
        </>
      );
    case "quote":
      return (
        <>
          <blockquote className="border-muted-foreground/30 my-1 border-l-2 pl-3 text-[15px] italic">
            {text}
          </blockquote>
          {kids}
        </>
      );
    case "image": {
      const url = b.props?.url as string | undefined;
      return url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="my-2 max-w-full rounded-md" />
      ) : null;
    }
    case "page":
      return (
        <div className="text-muted-foreground flex items-center gap-1.5 py-0.5 text-sm">
          <FileText className="size-3.5" /> Sub-page
        </div>
      );
    default:
      return (
        <>
          <p className="min-h-5 py-0.5 text-[15px] leading-relaxed">{text}</p>
          {kids}
        </>
      );
  }
}

/* ---- the card -------------------------------------------------------------- */
export function PageCardView({ card }: { card: PageCard }) {
  const edit = useCardEditing();
  const [panelOpen, setPanelOpen] = React.useState(false);

  // Shell double-click opens the reading panel.
  React.useEffect(() => {
    if (!edit || !card.pageId) return;
    edit.openRef.current = () => setPanelOpen(true);
    return () => {
      edit.openRef.current = null;
    };
  }, [edit, card.pageId]);

  if (!card.pageId) return <PagePicker card={card} />;

  return (
    <>
      <div className="group flex cursor-pointer items-center gap-2.5 p-3">
        <span className="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md text-base">
          <PageIcon name={card.icon} className="text-muted-foreground size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium">
            {card.title || "Untitled"}
          </span>
          <span className="text-muted-foreground text-xs">Page</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground pointer-events-auto size-7 shrink-0"
          aria-label="Read page"
          onClick={() => setPanelOpen(true)}
        >
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
      {/* stays mounted: unmounting an open Radix sheet skips its cleanup
          and leaves body pointer-events locked, freezing the board */}
      <PageReadPanel
        card={card}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </>
  );
}

// Select an existing document page from this workspace.
function PagePicker({ card }: { card: PageCard }) {
  const { client, updateCard } = useBoard();
  const [docs, setDocs] = React.useState<DocSummary[] | null>(null);

  React.useEffect(() => {
    let alive = true;
    client
      .list()
      .then((d) => alive && setDocs(d))
      .catch(() => alive && setDocs([]));
    return () => {
      alive = false;
    };
  }, [client]);

  return (
    <div className="flex flex-col gap-2 p-3" data-no-drag>
      <span className="text-muted-foreground text-xs font-medium">
        Link a page from this project
      </span>
      <Select
        onValueChange={(id) => {
          const d = docs?.find((x) => x.id === id);
          updateCard(card.id, {
            pageId: id,
            title: d?.title || "Untitled",
            icon: d?.icon || "",
          });
        }}
      >
        <SelectTrigger className="h-8 w-full text-sm">
          <SelectValue
            placeholder={docs === null ? "Loading pages…" : "Choose a page"}
          />
        </SelectTrigger>
        <SelectContent>
          {(docs ?? []).map((d) => (
            <SelectItem key={d.id} value={d.id}>
              <PageIcon name={d.icon} className="size-3.5" />
              {d.title || "Untitled"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Right-side reading panel: fetches the page and renders it read-only.
function PageReadPanel({
  card,
  open,
  onClose,
}: {
  card: PageCard;
  open: boolean;
  onClose: () => void;
}) {
  const { ws, client, updateCard } = useBoard();
  const [doc, setDoc] = React.useState<FullDoc | null>(null);
  const [error, setError] = React.useState(false);

  // (Re)load the page each time the panel opens.
  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    setDoc(null);
    setError(false);
    client
      .get(card.pageId)
      .then((d) => {
        if (!alive) return;
        if (d.error) setError(true);
        else {
          setDoc(d);
          // refresh the title/icon snapshot shown on the card
          if (d.title !== card.title || d.icon !== card.icon)
            updateCard(card.id, { title: d.title, icon: d.icon });
        }
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, card.pageId, open]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        // half the window; the Sheet portals to <body>, but its React events
        // still bubble into the card shell — stop them or selecting text in
        // the panel drags the card underneath
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:w-1/2 data-[side=right]:sm:max-w-none"
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <PageIcon
              name={doc?.icon || card.icon}
              className="text-muted-foreground size-4 shrink-0"
            />
            <span className="truncate">
              {doc?.title || card.title || "Untitled"}
            </span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            Read-only view
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              asChild
            >
              <a
                href={`/w/${ws}?doc=${card.pageId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open in editor <ArrowUpRight className="size-3" />
              </a>
            </Button>
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* editor-like page column: same comfortable measure and type
              scale as the document editor */}
          <div className="mx-auto w-full max-w-2xl select-text">
            {error ? (
              <p className="text-muted-foreground text-sm">
                This page could not be loaded — it may have been deleted.
              </p>
            ) : doc === null ? (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <RefreshCw className="size-3.5 animate-spin" /> Loading…
              </p>
            ) : (
              ((doc.blocks ?? []) as AnyBlock[]).map((b, i) => (
                <BlockView key={b.id ?? i} b={b} />
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Right-click settings for the page card.
export function PageMenuItems({ card }: { card: PageCard }) {
  const { ws, updateCard } = useBoard();
  return (
    <>
      <ContextMenuItem asChild>
        <a
          href={`/w/${ws}?doc=${card.pageId}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open in editor
        </a>
      </ContextMenuItem>
      <ContextMenuItem onClick={() => updateCard(card.id, { pageId: "" })}>
        Change page
      </ContextMenuItem>
    </>
  );
}

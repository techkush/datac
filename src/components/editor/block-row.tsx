"use client";

import * as React from "react";
import { GripVertical, MessageSquare, Plus } from "lucide-react";
import { useRuntime } from "./runtime";
import { BlockList } from "./block-list";
import type { Block } from "@/lib/datac/types";
import { isEditable, isTextType, newBlock } from "./blocks-util";
import { sanitizeHtml } from "@/lib/datac/markdown";
import { renderMathHtml } from "@/lib/datac/math";
import { formatSize } from "@/lib/datac/upload";
import { cn } from "@/lib/utils";

interface Props {
  listId: string;
  block: Block;
  index: number;
  markerNumber?: number;
  placeholder: string;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

// Editable text/code body: uncontrolled, DOM-as-truth. Sets innerHTML only
// when the stored html changes from what it last wrote (i.e. structural ops),
// never while typing (so the caret is preserved).
function EditableBody({
  block,
  placeholder,
  onKeyDown,
}: {
  block: Block;
  placeholder: string;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const rt = useRuntime();
  const ref = React.useRef<HTMLDivElement | null>(null);
  const lastHtml = React.useRef<string | null>(null);
  const isCode = block.type === "code";
  const value = isCode ? (block.text as string) || "" : block.html || "";

  const setEl = React.useCallback(
    (el: HTMLDivElement | null) => {
      ref.current = el;
      rt.register(block.id, el);
      if (el && lastHtml.current === null) {
        if (isCode) el.innerText = value;
        // block.html is canonical HTML (already entity-escaped) — render it as
        // HTML, never through the markdown path, or entities get re-escaped
        // (&amp; -> &amp;amp;) on every serialize (e.g. ticking a todo).
        else el.innerHTML = sanitizeHtml(value);
        lastHtml.current = value;
        updateEmpty(el, placeholder);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.id],
  );

  // external content changes (split/merge/turn-into/load)
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value !== lastHtml.current) {
      const focused = document.activeElement === el;
      if (!focused) {
        if (isCode) el.innerText = value;
        // block.html is canonical HTML (already entity-escaped) — render it as
        // HTML, never through the markdown path, or entities get re-escaped
        // (&amp; -> &amp;amp;) on every serialize (e.g. ticking a todo).
        else el.innerHTML = sanitizeHtml(value);
        lastHtml.current = value;
        updateEmpty(el, placeholder);
      }
    }
  }, [value, isCode, placeholder]);

  const detectSlash = (el: HTMLElement) => {
    if (!isTextType(block.type)) return;
    const text = el.textContent || "";
    if (/^\/[\w]*$/.test(text.trim())) {
      const sel = window.getSelection();
      const rect =
        sel && sel.rangeCount
          ? sel.getRangeAt(0).getClientRects()[0] || el.getBoundingClientRect()
          : el.getBoundingClientRect();
      rt.openSlash({
        listId: "",
        blockId: block.id,
        rect: rect as DOMRect,
        query: text.trim().slice(1),
      });
    } else {
      rt.openSlash(null);
    }
  };

  return (
    <div
      ref={setEl}
      data-block-body="true"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      onKeyDown={onKeyDown}
      onInput={(e) => {
        const el = e.currentTarget;
        updateEmpty(el, placeholder);
        rt.markChanged();
        detectSlash(el);
      }}
      className={cn(
        "min-w-0 flex-1 whitespace-pre-wrap break-words outline-none",
        isCode &&
          "bg-muted rounded-md p-3 font-mono text-sm whitespace-pre",
        block.type === "h1" && "text-3xl font-bold",
        block.type === "h2" && "text-2xl font-bold",
        block.type === "h3" && "text-xl font-semibold",
        block.type === "h4" && "text-lg font-semibold",
        block.type === "quote" &&
          "border-primary/40 border-l-2 pl-4 italic",
      )}
    />
  );
}

function updateEmpty(el: HTMLElement, placeholder: string) {
  const empty = el.textContent?.trim() === "" && el.children.length === 0;
  el.setAttribute("data-empty", empty && placeholder ? "true" : "false");
}

export function BlockRow({
  listId,
  block,
  index,
  markerNumber,
  placeholder,
  onKeyDown,
}: Props) {
  const rt = useRuntime();
  const props = (block.props as { checked?: boolean; tc?: string; bg?: string }) || {};

  const addAfter = () => {
    const nb = newBlock("paragraph");
    rt.mutateList(listId, (list) => {
      const next = list.slice();
      next.splice(index + 1, 0, nb);
      return next;
    });
    rt.requestFocus({ id: nb.id });
    rt.captureHistory();
  };

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    rt.openBlockMenu({
      listId,
      blockId: block.id,
      rect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
    });
  };

  const gutter = (
    <div
      className="absolute top-1 -left-11 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100"
      contentEditable={false}
    >
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          addAfter();
        }}
        className="text-muted-foreground hover:bg-accent flex size-5 items-center justify-center rounded"
        title="Add a line below"
      >
        <Plus className="size-4" />
      </button>
      <button
        type="button"
        draggable
        onClick={openMenu}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/datac", JSON.stringify({ listId, id: block.id }));
        }}
        className="text-muted-foreground hover:bg-accent flex size-5 cursor-grab items-center justify-center rounded"
        title="Drag to move · click for options"
      >
        <GripVertical className="size-4" />
      </button>
    </div>
  );

  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData("text/datac");
    if (!raw) return;
    e.preventDefault();
    try {
      const { listId: fromList, id } = JSON.parse(raw);
      if (id === block.id) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      rt.moveBlock(fromList, id, listId, after ? index + 1 : index);
    } catch {}
  };

  const rowWrap = (inner: React.ReactNode, extraClass?: string) => (
    <div
      className={cn("group/row relative", extraClass)}
      data-tc={props.tc || undefined}
      data-bg={props.bg || undefined}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      {gutter}
      {inner}
    </div>
  );

  // ---- component (non-text) blocks ----
  if (block.type === "divider") {
    return rowWrap(
      <div className="flex items-center py-2">
        <hr className="border-border flex-1" />
        <button
          onClick={() => rt.openComments(block.id)}
          className="text-muted-foreground hover:text-foreground ml-2 opacity-0 group-hover/row:opacity-100"
          contentEditable={false}
        >
          <MessageSquare className="size-4" />
        </button>
      </div>,
    );
  }

  if (block.type === "image") {
    return rowWrap(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={(block.url as string) || ""}
        alt={(block.alt as string) || ""}
        className="mx-auto max-h-[70vh] rounded-md"
      />,
      "py-1",
    );
  }

  if (block.type === "math") {
    const tex = (block.tex as string) || "";
    return rowWrap(
      <div
        role="button"
        tabIndex={0}
        onClick={() => rt.openMath({ listId, blockId: block.id, mode: "edit" })}
        className="hover:bg-accent/50 cursor-pointer overflow-x-auto rounded-md py-1"
        title="Click to edit equation"
        dangerouslySetInnerHTML={{
          __html: tex
            ? renderMathHtml(tex)
            : `<span class="text-muted-foreground text-sm">Empty equation — click to edit</span>`,
        }}
      />,
    );
  }

  if (block.type === "page") {
    const child = rt.docs.find((d) => d.id === block.pageId);
    return rowWrap(
      <FileCard
        icon={child?.icon || "📄"}
        name={child?.title || "Untitled"}
        sub={block.link ? "Link ›" : "Page ›"}
        note={(block.note as string) || ""}
        listId={listId}
        blockId={block.id}
        onOpen={() => block.pageId && rt.openDoc(block.pageId)}
      />,
      "py-1",
    );
  }

  if (block.type === "file" || block.type === "linkfile") {
    return rowWrap(
      <FileCard
        icon={block.type === "linkfile" ? "🔗" : "📎"}
        name={(block.name as string) || "file"}
        sub={
          block.type === "linkfile"
            ? (block.path as string) || ""
            : block.size
              ? formatSize(block.size as number)
              : "uploaded file"
        }
        note={(block.note as string) || ""}
        listId={listId}
        blockId={block.id}
        onOpen={() =>
          block.type === "linkfile"
            ? rt.client.openFile((block.path as string) || "")
            : window.open((block.url as string) || "", "_blank")
        }
      />,
      "py-1",
    );
  }

  if (block.type === "columns") {
    const cols = (block.cols as Block[][]) || [];
    return rowWrap(
      <div
        className="grid gap-4 py-1"
        style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}
      >
        {cols.map((col, i) => (
          <div key={i} className="border-border/50 flex flex-col gap-1 rounded-md">
            <BlockList listId={`${block.id}#${i}`} blocks={col} />
          </div>
        ))}
      </div>,
    );
  }

  // ---- text + code + todo + list markers ----
  const marker =
    block.type === "bulleted" ? (
      <span className="text-muted-foreground mt-[3px] select-none">•</span>
    ) : block.type === "numbered" ? (
      <span className="text-muted-foreground mt-[1px] tabular-nums select-none">
        {markerNumber}.
      </span>
    ) : block.type === "todo" ? (
      <input
        type="checkbox"
        checked={!!props.checked}
        onChange={(e) => {
          const checked = e.target.checked;
          rt.mutateList(listId, (list) => {
            const next = list.slice();
            const b = next[index];
            const p = { ...(b.props as object), checked };
            if (!checked) delete (p as { checked?: boolean }).checked;
            next[index] = { ...b, props: p };
            return next;
          });
          rt.captureHistory();
        }}
        className="mt-1.5"
        contentEditable={false}
      />
    ) : null;

  const hasComment =
    !!block.id && (rt.comments[block.id]?.length ?? 0) > 0;

  return rowWrap(
    <div className="flex items-start gap-2">
      {marker}
      <EditableBody block={block} placeholder={placeholder} onKeyDown={onKeyDown} />
      {isEditable(block.type) && (
        <button
          onClick={() => rt.openComments(block.id)}
          className={cn(
            "text-muted-foreground hover:text-foreground mt-1 shrink-0",
            hasComment ? "opacity-100" : "opacity-0 group-hover/row:opacity-100",
          )}
          contentEditable={false}
          title="Comment"
        >
          <MessageSquare className="size-4" />
          {hasComment && (
            <span className="text-primary ml-0.5 text-[10px]">
              {rt.comments[block.id].length}
            </span>
          )}
        </button>
      )}
    </div>,
    isTextType(block.type) ? "px-1 py-0.5" : undefined,
  );
}

function FileCard({
  icon,
  name,
  sub,
  note,
  listId,
  blockId,
  onOpen,
}: {
  icon: string;
  name: string;
  sub: string;
  note: string;
  listId: string;
  blockId: string;
  onOpen: () => void;
}) {
  const rt = useRuntime();
  const taRef = React.useRef<HTMLTextAreaElement>(null);
  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  React.useEffect(grow, []);
  return (
    <div className="rounded-md border p-2" contentEditable={false}>
      <button
        onClick={onOpen}
        className="hover:bg-accent flex w-full items-center gap-3 rounded p-1.5 text-left"
      >
        <span className="text-xl">{icon}</span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-muted-foreground truncate text-xs">{sub}</span>
        </span>
        <span className="text-muted-foreground ml-auto">↗</span>
      </button>
      <textarea
        ref={taRef}
        defaultValue={note}
        rows={1}
        placeholder="Add a note…"
        onInput={grow}
        onChange={(e) => {
          const val = e.target.value;
          rt.mutateList(listId, (list) =>
            list.map((b) => (b.id === blockId ? { ...b, note: val } : b)),
          );
        }}
        className="text-muted-foreground placeholder:text-muted-foreground/50 mt-1 w-full resize-none border-0 bg-transparent px-1.5 text-sm outline-none"
      />
    </div>
  );
}

"use client";

import * as React from "react";
import { Bold, Italic, Underline, Strikethrough, Code, Link2 } from "lucide-react";
import { BLOCK_TYPES, BLOCK_COLORS, type BlockTypeDef } from "@/lib/datac/constants";
import type { DocSummary } from "@/lib/datac/types";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

/* ---------- positioned floating container with outside-click close ------- */
function Floating({
  rect,
  width = 300,
  onClose,
  children,
  below = true,
}: {
  rect: DOMRect;
  width?: number;
  onClose: () => void;
  children: React.ReactNode;
  below?: boolean;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);
  const top = below ? rect.bottom + 6 : rect.top - 6;
  const left = Math.min(rect.left, window.innerWidth - width - 12);
  return (
    <div
      ref={ref}
      className="bg-popover text-popover-foreground animate-in fade-in-0 zoom-in-95 fixed z-50 overflow-hidden rounded-lg border shadow-md"
      style={{ top, left, width, maxHeight: "min(360px, 60vh)" }}
    >
      {children}
    </div>
  );
}

/* ---------------------------- slash menu -------------------------------- */
export function SlashMenu({
  rect,
  query,
  onPick,
  onClose,
}: {
  rect: DOMRect;
  query: string;
  onPick: (item: BlockTypeDef) => void;
  onClose: () => void;
}) {
  const items = React.useMemo(() => {
    const q = query.toLowerCase();
    return BLOCK_TYPES.filter(
      (b) => !q || b.label.toLowerCase().includes(q) || b.keys.includes(q),
    );
  }, [query]);
  const [index, setIndex] = React.useState(0);
  React.useEffect(() => setIndex(0), [query]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        setIndex((i) => (i + 1) % Math.max(items.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        setIndex((i) => (i - 1 + items.length) % Math.max(items.length, 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (items[index]) onPick(items[index]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [items, index, onPick, onClose]);

  return (
    <Floating rect={rect} onClose={onClose}>
      <div className="max-h-[inherit] overflow-y-auto p-1">
        <div className="text-muted-foreground px-2 py-1 text-[11px] font-medium uppercase">
          Blocks
        </div>
        {items.length === 0 && (
          <div className="text-muted-foreground px-2 py-3 text-sm">
            No matching blocks
          </div>
        )}
        {items.map((b, i) => (
          <button
            key={b.type}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(b);
            }}
            onMouseMove={() => setIndex(i)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm",
              i === index && "bg-accent",
            )}
          >
            <span className="bg-muted flex size-7 shrink-0 items-center justify-center rounded text-xs">
              {b.icon}
            </span>
            <span className="flex flex-col">
              <span>{b.label}</span>
              <span className="text-muted-foreground text-xs">{b.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </Floating>
  );
}

/* ---------------------------- block menu -------------------------------- */
const TURN_INTO = [
  { type: "paragraph", label: "Text", icon: "¶" },
  { type: "h1", label: "Heading 1", icon: "H₁" },
  { type: "h2", label: "Heading 2", icon: "H₂" },
  { type: "h3", label: "Heading 3", icon: "H₃" },
  { type: "h4", label: "Heading 4", icon: "H₄" },
  { type: "bulleted", label: "Bulleted", icon: "•" },
  { type: "numbered", label: "Numbered", icon: "1." },
  { type: "todo", label: "To-do", icon: "☑" },
  { type: "quote", label: "Quote", icon: "❝" },
  { type: "code", label: "Code", icon: "</>" },
];

export function BlockMenu({
  rect,
  onClose,
  onDelete,
  onDuplicate,
  onTurnInto,
  onColor,
}: {
  rect: DOMRect;
  onClose: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onTurnInto: (type: string) => void;
  onColor: (kind: "tc" | "bg", name: string) => void;
}) {
  return (
    <Floating rect={rect} width={264} onClose={onClose}>
      <div className="p-1">
        <MenuRow onClick={() => { onDuplicate(); onClose(); }}>⧉ Duplicate</MenuRow>
        <MenuRow
          destructive
          onClick={() => { onDelete(); onClose(); }}
        >
          🗑️ Delete
        </MenuRow>
        <Separator className="my-1" />
        <div className="text-muted-foreground px-2 py-1 text-[11px] font-medium uppercase">
          Turn into
        </div>
        <div className="grid grid-cols-2 gap-0.5">
          {TURN_INTO.map((t) => (
            <button
              key={t.type}
              onClick={() => { onTurnInto(t.type); onClose(); }}
              className="hover:bg-accent flex items-center gap-2 rounded px-2 py-1 text-left text-sm"
            >
              <span className="text-muted-foreground w-4 text-xs">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
        <Separator className="my-1" />
        <ColorRow label="Text color" kind="tc" onColor={onColor} />
        <ColorRow label="Background" kind="bg" onColor={onColor} />
      </div>
    </Floating>
  );
}

function MenuRow({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "hover:bg-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
        destructive && "text-destructive hover:bg-destructive/10",
      )}
    >
      {children}
    </button>
  );
}

function ColorRow({
  label,
  kind,
  onColor,
}: {
  label: string;
  kind: "tc" | "bg";
  onColor: (kind: "tc" | "bg", name: string) => void;
}) {
  return (
    <div className="px-1 py-0.5">
      <div className="text-muted-foreground px-1 py-0.5 text-[11px] font-medium uppercase">
        {label}
      </div>
      <div className="flex flex-wrap gap-1">
        {BLOCK_COLORS.map((c) => (
          <button
            key={c}
            title={c}
            onClick={() => onColor(kind, c)}
            data-tc={kind === "tc" && c !== "default" ? c : undefined}
            data-bg={kind === "bg" && c !== "default" ? c : undefined}
            className="hover:ring-ring flex size-6 items-center justify-center rounded border text-xs hover:ring-2"
          >
            {kind === "tc" ? "A" : ""}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------- inline selection toolbar --------------------- */
export function InlineToolbar({
  rootRef,
  onChange,
}: {
  rootRef: React.RefObject<HTMLElement | null>;
  onChange: () => void;
}) {
  const [box, setBox] = React.useState<{ top: number; left: number } | null>(
    null,
  );

  React.useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) {
        setBox(null);
        return;
      }
      const anchor = sel.anchorNode;
      if (!anchor || !rootRef.current?.contains(anchor)) {
        setBox(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (!rect.width) {
        setBox(null);
        return;
      }
      setBox({ top: rect.top - 44, left: rect.left + rect.width / 2 });
    };
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [rootRef]);

  if (!box) return null;

  const exec = (cmd: string) => {
    document.execCommand(cmd);
    onChange();
  };
  const toggleCode = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    let anc: Node | null = range.commonAncestorContainer;
    if (anc.nodeType === 3) anc = anc.parentNode;
    const codeEl = (anc as HTMLElement)?.closest?.("code");
    if (codeEl) {
      const parent = codeEl.parentNode!;
      while (codeEl.firstChild) parent.insertBefore(codeEl.firstChild, codeEl);
      parent.removeChild(codeEl);
    } else {
      const text = range.toString();
      if (!text) return;
      const code = document.createElement("code");
      code.textContent = text;
      range.deleteContents();
      range.insertNode(code);
    }
    onChange();
  };
  const link = () => {
    const url = prompt("Link URL:");
    if (url) exec("createLink");
    if (url) document.execCommand("createLink", false, url);
  };

  return (
    <div
      className="bg-popover text-popover-foreground fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-md border p-0.5 shadow-md"
      style={{ top: box.top, left: box.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <TBtn onClick={() => exec("bold")}><Bold className="size-4" /></TBtn>
      <TBtn onClick={() => exec("italic")}><Italic className="size-4" /></TBtn>
      <TBtn onClick={() => exec("underline")}><Underline className="size-4" /></TBtn>
      <TBtn onClick={() => exec("strikeThrough")}><Strikethrough className="size-4" /></TBtn>
      <TBtn onClick={toggleCode}><Code className="size-4" /></TBtn>
      <TBtn onClick={link}><Link2 className="size-4" /></TBtn>
    </div>
  );
}

function TBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hover:bg-accent flex size-7 items-center justify-center rounded"
    >
      {children}
    </button>
  );
}

/* ----------------------------- page picker ------------------------------ */
export function PagePicker({
  rect,
  docs,
  currentId,
  onPick,
  onClose,
}: {
  rect: DOMRect;
  docs: DocSummary[];
  currentId: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = React.useState("");
  const items = docs.filter(
    (d) =>
      d.id !== currentId &&
      (!q || (d.title || "").toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <Floating rect={rect} onClose={onClose}>
      <div className="p-2">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Link to a page…"
          className="bg-muted mb-1 w-full rounded-md px-2 py-1.5 text-sm outline-none"
        />
        <div className="max-h-56 overflow-y-auto">
          {items.length === 0 && (
            <div className="text-muted-foreground px-2 py-2 text-sm">No pages</div>
          )}
          {items.map((d) => (
            <button
              key={d.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(d.id);
              }}
              className="hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
            >
              <span>{d.icon || "📄"}</span>
              <span className="truncate">{d.title || "Untitled"}</span>
            </button>
          ))}
        </div>
      </div>
    </Floating>
  );
}

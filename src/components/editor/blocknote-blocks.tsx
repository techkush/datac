"use client";

// Custom BlockNote blocks that carry datac's own ideas: sub-pages /
// page links, KaTeX math, and linked local files. They read app state
// via useEditor (store) and editor-local actions via EditorBridge.

import * as React from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { FileText, Link2, SquareSigma, ExternalLink } from "lucide-react";
import { useEditor } from "./store";
import { PageIcon } from "@/components/page-icon";
import { renderMathHtml } from "@/lib/datac/math";
import { toast } from "sonner";

// Editor-local actions provided by blocknote-editor.tsx (panel state
// lives there, not in the store).
export interface EditorBridge {
  editMath: (blockId: string, tex: string) => void;
}

export const EditorBridgeContext = React.createContext<EditorBridge>({
  editMath: () => {},
});

/* ---- math: KaTeX display block, edited via the math panel ---------------- */

export const MathBlock = createReactBlockSpec(
  {
    type: "math",
    propSchema: { tex: { default: "" } },
    content: "none",
  },
  {
    render: (props) => <MathBlockView block={props.block} />,
  },
);

function MathBlockView({ block }: { block: { id: string; props: { tex: string } } }) {
  const bridge = React.useContext(EditorBridgeContext);
  const tex = block.props.tex;
  const html = React.useMemo(() => (tex ? renderMathHtml(tex) : ""), [tex]);
  return (
    <div
      className="datac-math hover:bg-accent/40 w-full cursor-pointer rounded-md px-2 py-1 transition-colors"
      role="button"
      title="Click to edit formula"
      onClick={() => bridge.editMath(block.id, tex)}
    >
      {tex ? (
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <SquareSigma className="size-4" /> Empty formula — click to edit
        </span>
      )}
    </div>
  );
}

/* ---- page: owned sub-page or link-to-page -------------------------------- */

export const PageBlock = createReactBlockSpec(
  {
    type: "page",
    propSchema: {
      pageId: { default: "" },
      // true = a reference to a page owned elsewhere; false = owned sub-page
      link: { default: false },
      note: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <PageBlockView
        pageId={block.props.pageId}
        link={block.props.link}
        note={block.props.note}
        isEditable={editor.isEditable}
        onNoteChange={(v) =>
          editor.updateBlock(block, { props: { ...block.props, note: v } })
        }
      />
    ),
  },
);

function PageBlockView({
  pageId,
  link,
  note,
  isEditable,
  onNoteChange,
}: {
  pageId: string;
  link: boolean;
  note: string;
  isEditable: boolean;
  onNoteChange: (v: string) => void;
}) {
  const { docs, openDoc } = useEditor();
  const doc = docs.find((d) => d.id === pageId);
  const title = doc?.title || "Untitled";
  const icon = doc?.icon;
  const missing = !doc;
  return (
    <div className="w-full py-0.5">
      <div
        className="border-border hover:bg-accent/50 flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors"
        role="button"
        onClick={() => {
          if (missing) {
            toast.error("This page no longer exists");
            return;
          }
          openDoc(pageId);
        }}
      >
        <span className="flex items-center text-base leading-none">
          {icon ? (
            <PageIcon name={icon} className="size-4" />
          ) : link ? (
            <Link2 className="size-4" />
          ) : (
            <FileText className="size-4" />
          )}
        </span>
        <span
          className={
            missing
              ? "text-muted-foreground truncate text-sm line-through"
              : "truncate text-sm font-medium"
          }
        >
          {missing ? "Deleted page" : title}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          {link ? "Link ›" : "Page ›"}
        </span>
      </div>
      {(note || undefined) && (
        <div className="text-muted-foreground px-3 pt-1 text-xs">{note}</div>
      )}
      {isEditable && <NoteEditor note={note} onChange={onNoteChange} />}
    </div>
  );
}

// Small inline note field shown under page cards while editable.
function NoteEditor({
  note,
  onChange,
}: {
  note: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(note);
  if (!editing)
    return (
      <button
        type="button"
        className="text-muted-foreground/70 hover:text-muted-foreground px-3 pt-0.5 text-xs"
        onClick={() => {
          setValue(note);
          setEditing(true);
        }}
      >
        {note ? "Edit note" : "Add note"}
      </button>
    );
  return (
    <input
      className="text-muted-foreground mt-1 ml-3 w-[calc(100%-1.5rem)] rounded border bg-transparent px-2 py-1 text-xs outline-none"
      value={value}
      autoFocus
      placeholder="Note…"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        onChange(value.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "Escape")
          (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/* ---- linkfile: reference to a local file by absolute path ---------------- */

export const LinkFileBlock = createReactBlockSpec(
  {
    type: "linkfile",
    propSchema: {
      path: { default: "" },
      name: { default: "" },
      note: { default: "" },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <LinkFileBlockView
        path={block.props.path}
        name={block.props.name}
        note={block.props.note}
        isEditable={editor.isEditable}
        onNoteChange={(v) =>
          editor.updateBlock(block, { props: { ...block.props, note: v } })
        }
      />
    ),
  },
);

function LinkFileBlockView({
  path,
  name,
  note,
  isEditable,
  onNoteChange,
}: {
  path: string;
  name: string;
  note: string;
  isEditable: boolean;
  onNoteChange: (v: string) => void;
}) {
  const { client } = useEditor();
  return (
    <div className="w-full py-0.5">
      <div
        className="border-border hover:bg-accent/50 flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 transition-colors"
        role="button"
        title={path}
        onClick={async () => {
          const r = await client.openFile(path);
          if (!r?.ok) toast.error("Could not open the file");
        }}
      >
        <ExternalLink className="text-muted-foreground size-4 shrink-0" />
        <span className="truncate text-sm font-medium">
          {name || path.split("/").pop() || "file"}
        </span>
        <span className="text-muted-foreground ml-auto truncate text-xs">
          {path}
        </span>
      </div>
      {isEditable && <NoteEditor note={note} onChange={onNoteChange} />}
    </div>
  );
}

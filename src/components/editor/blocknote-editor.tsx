"use client";

// The BlockNote-based editor engine (replaces the hand-rolled
// contenteditable): native multi-block selection, backspace deletion,
// drag handles, slash menu, undo/redo — plus datac's custom blocks
// (sub-pages, math, linked files) and per-block comments.

import * as React from "react";
import { useTheme } from "next-themes";
import {
  BlockNoteSchema,
  createCodeBlockSpec,
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  SideMenuController,
  SideMenu,
  DragHandleMenu,
  getDefaultReactSlashMenuItems,
  FormattingToolbar,
  FormattingToolbarController,
  getFormattingToolbarItems,
  TextAlignButton,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { offset, flip, shift, size } from "@floating-ui/react";
import { codeBlockOptions } from "@blocknote/code-block";
import {
  withMultiColumn,
  multiColumnDropCursor,
  getMultiColumnSlashMenuItems,
  locales as multiColumnLocales,
} from "@blocknote/xl-multi-column";
import * as locales from "@blocknote/core/locales";
import "@blocknote/core/style.css";
import "@blocknote/mantine/style.css";

import {
  FileText,
  Link2,
  SquareSigma,
  MessageSquareText,
  FolderSymlink,
} from "lucide-react";
import { toast } from "sonner";
import { useEditor } from "./store";
import {
  MathBlock,
  PageBlock,
  LinkFileBlock,
  EditorBridgeContext,
} from "./blocknote-blocks";
import { LatexDialog } from "./latex-dialog";
import { BlockOptionsMenu } from "./block-options-menu";
import {
  isBlockNoteDoc,
  legacyToBlockNote,
} from "@/lib/datac/blocknote-convert";
import { CommentsPanel } from "./comments-panel";
import { readAsDataURL } from "@/lib/datac/upload";
import { PageIcon } from "@/components/page-icon";
import type { Block, DocSummary } from "@/lib/datac/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/* ---- schema -------------------------------------------------------------- */

const schema = withMultiColumn(
  BlockNoteSchema.create().extend({
    blockSpecs: {
      codeBlock: createCodeBlockSpec({
        ...codeBlockOptions,
        defaultLanguage: "javascript",
        supportedLanguages: {
          text: { name: "Plain Text" },
          typescript: { name: "TypeScript", aliases: ["ts"] },
          javascript: { name: "JavaScript", aliases: ["js"] },
          python: { name: "Python", aliases: ["py"] },
          cpp: { name: "C++", aliases: ["cpp", "c++"] },
          java: { name: "Java" },
          rust: { name: "Rust", aliases: ["rs"] },
          go: { name: "Go" },
          sql: { name: "SQL" },
          json: { name: "JSON" },
          bash: { name: "Bash", aliases: ["sh", "shell", "zsh"] },
          html: { name: "HTML" },
          css: { name: "CSS" },
        },
      }),
      math: MathBlock(),
      page: PageBlock(),
      linkfile: LinkFileBlock(),
    },
  }),
);

type DatacEditor = typeof schema.BlockNoteEditor;

/* ---- page ids present in a BlockNote document (owned sub-pages) ---------- */

function ownedPageIds(blocks: unknown[]): Set<string> {
  const out = new Set<string>();
  const walk = (list: unknown[]) => {
    for (const raw of list || []) {
      const b = raw as {
        type?: string;
        props?: { pageId?: string; link?: boolean };
        children?: unknown[];
      };
      if (b.type === "page" && b.props?.pageId && !b.props.link)
        out.add(b.props.pageId);
      if (Array.isArray(b.children)) walk(b.children);
    }
  };
  walk(blocks);
  return out;
}

/* ---- the editor ----------------------------------------------------------- */

export function BlockNoteEditor() {
  const store = useEditor();
  const { resolvedTheme } = useTheme();

  const [mathTarget, setMathTarget] = React.useState<{
    blockId: string | null; // null = insert new at cursor
    tex: string;
  } | null>(null);
  const [commentsTarget, setCommentsTarget] = React.useState<string | null>(
    null,
  );
  const [pagePickerOpen, setPagePickerOpen] = React.useState(false);
  const [moveTargetId, setMoveTargetId] = React.useState<string | null>(null);
  // Suppresses orphan tracking while a block is moved between pages.
  const movingRef = React.useRef(false);
  // Overlay geometry: recomputed (debounced) after content edits.
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [layoutTick, setLayoutTick] = React.useState(0);
  const tickTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useCreateBlockNote(
    {
      schema,
      initialContent: store.blocks.length
        ? (store.blocks as never)
        : undefined,
      dropCursor: multiColumnDropCursor,
      dictionary: {
        ...locales.en,
        multi_column: multiColumnLocales.en,
      },
      uploadFile: async (file: File) => {
        const dataUrl = await readAsDataURL(file);
        const up = await store.client.upload(file.name, dataUrl);
        if (!up?.url) throw new Error("upload failed");
        return up.url;
      },
      tables: {
        splitCells: true,
        cellBackgroundColor: true,
        cellTextColor: true,
        headers: true,
      },
    },
    // The doc area remounts this component per doc (key=currentId), so the
    // editor instance is created once per document.
    [],
  );

  // Deep link: /w/<ws>?doc=<docId>&block=<blockId> scrolls to and
  // flashes the linked block once the editor is mounted.
  React.useEffect(() => {
    const params = new URLSearchParams(location.search);
    const blockId = params.get("block");
    const docId = params.get("doc");
    if (!blockId || (docId && docId !== store.currentId)) return;
    const t = setTimeout(() => {
      const el = document.querySelector(
        `.bn-block-outer[data-id="${CSS.escape(blockId)}"]`,
      );
      if (el) {
        el.scrollIntoView({ block: "center" });
        el.classList.add("dc-block-flash");
        setTimeout(() => el.classList.remove("dc-block-flash"), 2200);
      }
      history.replaceState(null, "", location.pathname);
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The store pulls the live document at save time.
  React.useEffect(() => {
    store.setSerializer(() => editor.document as unknown as Block[]);
    return () => store.setSerializer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Track owned sub-page blocks: deleting one orphans the child page
  // (restorable from the sidebar), re-adding it (undo) un-orphans.
  const pageIdsRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    pageIdsRef.current = ownedPageIds(editor.document as unknown[]);
  }, [editor]);

  const handleChange = React.useCallback(() => {
    const current = ownedPageIds(editor.document as unknown[]);
    const previous = pageIdsRef.current;
    pageIdsRef.current = current;
    if (movingRef.current) {
      store.scheduleSave();
      return;
    }
    for (const id of previous)
      if (!current.has(id)) store.orphanPage(id);
    for (const id of current)
      if (!previous.has(id)) {
        const doc = store.docs.find((d) => d.id === id);
        if (doc?.orphaned) store.reattachPage(id);
      }
    store.scheduleSave();
    if (tickTimer.current) clearTimeout(tickTimer.current);
    tickTimer.current = setTimeout(() => setLayoutTick((t) => t + 1), 250);
  }, [editor, store]);

  /* ---- slash menu items -------------------------------------------------- */

  const insertSubPage = React.useCallback(
    async (ed: DatacEditor) => {
      const childId = await store.createChildPage();
      if (!childId) {
        toast.error("Could not create the page");
        return;
      }
      insertOrUpdateBlockForSlashMenu(ed, {
        type: "page",
        props: { pageId: childId, link: false, note: "" },
      });
      await store.refreshDocs();
      // Give the insertion a beat to land in the document, then follow it.
      setTimeout(() => store.openDoc(childId), 50);
    },
    [store],
  );

  const insertLinkFile = React.useCallback(
    async (ed: DatacEditor) => {
      const picked = await store.client.pickFile();
      if (!picked || !("path" in picked) || !picked.path) return;
      insertOrUpdateBlockForSlashMenu(ed, {
        type: "linkfile",
        props: { path: picked.path, name: picked.name || "", note: "" },
      });
    },
    [store],
  );

  const getSlashItems = React.useCallback(
    async (query: string) => {
      const items = [
        ...getDefaultReactSlashMenuItems(editor),
        ...getMultiColumnSlashMenuItems(editor),
        {
          title: "Sub-page",
          subtext: "Create a page inside this page",
          aliases: ["page", "subpage", "child"],
          group: "Datac",
          icon: <FileText className="size-4.5" />,
          onItemClick: () => insertSubPage(editor),
        },
        {
          title: "Link to page",
          subtext: "Reference an existing page",
          aliases: ["pagelink", "link", "ref"],
          group: "Datac",
          icon: <Link2 className="size-4.5" />,
          onItemClick: () => setPagePickerOpen(true),
        },
        {
          title: "LaTeX formula",
          subtext: "Type LaTeX code with a live preview",
          aliases: ["latex", "math", "katex", "equation", "formula"],
          group: "Datac",
          icon: <SquareSigma className="size-4.5" />,
          onItemClick: () => setMathTarget({ blockId: null, tex: "" }),
        },
        {
          title: "Linked local file",
          subtext: "Reference a file on disk without copying it",
          aliases: ["linkfile", "local", "attach"],
          group: "Datac",
          icon: <FolderSymlink className="size-4.5" />,
          onItemClick: () => insertLinkFile(editor),
        },
      ];
      return filterSuggestionItems(items, query);
    },
    [editor, insertSubPage, insertLinkFile],
  );

  /* ---- panels ------------------------------------------------------------- */

  const commitMath = React.useCallback(
    (tex: string) => {
      if (!mathTarget) return;
      if (mathTarget.blockId) {
        editor.updateBlock(mathTarget.blockId, {
          type: "math",
          props: { tex },
        });
      } else {
        insertOrUpdateBlockForSlashMenu(editor, {
          type: "math",
          props: { tex },
        });
      }
      setMathTarget(null);
    },
    [editor, mathTarget],
  );

  const bridge = React.useMemo(
    () => ({
      editMath: (blockId: string, tex: string) =>
        setMathTarget({ blockId, tex }),
    }),
    [],
  );

  const moveBlockToPage = React.useCallback(
    async (target: DocSummary) => {
      const blockId = moveTargetId;
      setMoveTargetId(null);
      if (!blockId) return;
      const b = editor.getBlock(blockId);
      if (!b) return;
      movingRef.current = true;
      try {
        const doc = await store.client.get(target.id);
        if (!doc || doc.error) throw new Error();
        let blocks = Array.isArray(doc.blocks) ? doc.blocks.slice() : [];
        if (blocks.length && !isBlockNoteDoc(blocks))
          blocks = legacyToBlockNote(blocks) as never[];
        blocks.push(b as never);
        await store.client.save(target.id, {
          title: doc.title,
          icon: doc.icon,
          cover: doc.cover,
          parent: doc.parent || "",
          status: doc.status || "",
          orphaned: !!doc.orphaned,
          blocks,
          comments: doc.comments,
        });
        // Owned sub-pages inside the moved block now belong to the target.
        for (const pid of ownedPageIds([b as never])) {
          const child = await store.client.get(pid);
          if (child && !child.error)
            await store.client.save(pid, {
              title: child.title,
              icon: child.icon,
              cover: child.cover,
              parent: target.id,
              status: child.status || "",
              orphaned: false,
              blocks: child.blocks || [],
              comments: child.comments,
            });
        }
        editor.removeBlocks([blockId]);
        await store.refreshDocs();
        toast.success(`Moved to “${target.title || "Untitled"}”`);
      } catch {
        toast.error("Move failed");
      } finally {
        pageIdsRef.current = ownedPageIds(editor.document as unknown[]);
        movingRef.current = false;
        store.scheduleSave();
      }
    },
    [editor, moveTargetId, store],
  );

  const insertPageLink = React.useCallback(
    (doc: DocSummary) => {
      editor.insertBlocks(
        [
          {
            type: "page",
            props: { pageId: doc.id, link: true, note: "" },
          } as never,
        ],
        editor.getTextCursorPosition().block,
        "after",
      );
      setPagePickerOpen(false);
    },
    [editor],
  );

  return (
    <EditorBridgeContext.Provider value={bridge}>
      <div ref={wrapperRef} className="relative">
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme === "dark" ? "dark" : "light"}
        onChange={handleChange}
        slashMenu={false}
        sideMenu={false}
        formattingToolbar={false}
        className="datac-blocknote"
      >
        {/* Default formatting toolbar plus a Justify alignment button (the
            built-in toolbar only offers left/center/right). */}
        <FormattingToolbarController
          formattingToolbar={() => {
            const items = getFormattingToolbarItems();
            const rightIdx = items.findIndex(
              (el) => el.key === "textAlignRightButton",
            );
            const justify = (
              <TextAlignButton
                key="textAlignJustifyButton"
                textAlignment="justify"
              />
            );
            const withJustify =
              rightIdx >= 0
                ? [
                    ...items.slice(0, rightIdx + 1),
                    justify,
                    ...items.slice(rightIdx + 1),
                  ]
                : [...items, justify];
            return <FormattingToolbar>{withJustify}</FormattingToolbar>;
          }}
        />
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={getSlashItems}
          floatingUIOptions={{
            useFloatingOptions: {
              // Open the command menu ABOVE the focused line so it never
              // ends up squeezed into the space under the caret; drop
              // below only when there is no room above.
              placement: "top-start",
              middleware: [
                offset(10),
                flip({ fallbackPlacements: ["bottom-start"], padding: 10 }),
                shift({ padding: 10 }),
                size({
                  apply({ elements, availableHeight }) {
                    elements.floating.style.maxHeight = `${Math.max(
                      160,
                      availableHeight,
                    )}px`;
                  },
                  padding: 10,
                }),
              ],
            },
          }}
        />
        <SideMenuController
          sideMenu={() => (
            <SideMenu
              dragHandleMenu={() => (
                <DragHandleMenu>
                  <BlockOptionsMenu
                    onOpenComments={(bid) => setCommentsTarget(bid)}
                    onEditMath={(blockId, tex) =>
                      setMathTarget({ blockId, tex })
                    }
                    onMoveTo={(bid) => setMoveTargetId(bid)}
                  />
                </DragHandleMenu>
              )}
            />
          )}
        />
      </BlockNoteView>
      <CommentOverlay
        wrapperRef={wrapperRef}
        tick={layoutTick}
        onOpen={(bid) => setCommentsTarget(bid)}
      />
      </div>

      <LatexDialog
        key={mathTarget ? (mathTarget.blockId ?? "insert") : "math-closed"}
        open={!!mathTarget}
        mode={mathTarget?.blockId ? "edit" : "insert"}
        initialTex={mathTarget?.tex || ""}
        onCommit={commitMath}
        onClose={() => setMathTarget(null)}
      />
      <CommentsPanel
        bid={commentsTarget}
        onClose={() => setCommentsTarget(null)}
      />
      <PagePickerDialog
        key={pagePickerOpen ? "open" : "picker-closed"}
        open={pagePickerOpen}
        onClose={() => setPagePickerOpen(false)}
        onPick={insertPageLink}
      />
      <PagePickerDialog
        key={moveTargetId ? `move-${moveTargetId}` : "move-closed"}
        title="Move block to page"
        open={!!moveTargetId}
        onClose={() => setMoveTargetId(null)}
        onPick={moveBlockToPage}
      />
    </EditorBridgeContext.Provider>
  );
}

/* ---- per-block comment affordance (Notion-style, right gutter) ------------- */

function CommentOverlay({
  wrapperRef,
  tick,
  onOpen,
}: {
  wrapperRef: React.RefObject<HTMLDivElement | null>;
  tick: number;
  onOpen: (blockId: string) => void;
}) {
  const { comments } = useEditor();
  const [tops, setTops] = React.useState<Record<string, number>>({});
  const [resizeTick, setResizeTick] = React.useState(0);

  React.useEffect(() => {
    const onResize = () => setResizeTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const ids = React.useMemo(
    () => Object.keys(comments).filter((id) => comments[id]?.length),
    [comments],
  );

  // Block top offsets relative to the wrapper (stable while scrolling,
  // recomputed after edits/resizes).
  React.useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const base = el.getBoundingClientRect().top;
    const next: Record<string, number> = {};
    for (const id of ids) {
      const b = el.querySelector(
        `.bn-block-outer[data-id="${CSS.escape(id)}"]`,
      ) as HTMLElement | null;
      if (b) next[id] = b.getBoundingClientRect().top - base;
    }
    setTops(next);
  }, [ids, tick, resizeTick, wrapperRef]);

  return (
    <>
      {ids.map((id) => {
        const top = tops[id];
        if (top === undefined) return null;
        const count = comments[id]?.length || 0;
        if (!count) return null;
        return (
          <button
            key={id}
            type="button"
            data-dc-overlay
            title={`Comments (${count})`}
            className="text-muted-foreground hover:text-foreground bg-background/80 absolute z-10 flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs shadow-sm"
            style={{ top: Math.max(0, top + 2), right: "-3.25rem" }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onOpen(id);
            }}
          >
            <MessageSquareText className="size-3.5" />
            <span className="tabular-nums">{count}</span>
          </button>
        );
      })}
    </>
  );
}

/* ---- page picker for "Link to page" ---------------------------------------- */

function PagePickerDialog({
  open,
  title = "Link to page",
  onClose,
  onPick,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onPick: (doc: DocSummary) => void;
}) {
  const { docs, currentId } = useEditor();
  // Query resets naturally: the dialog list only shows while open.
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const matches = docs.filter(
    (d) =>
      d.id !== currentId &&
      (!q || (d.title || "Untitled").toLowerCase().includes(q)),
  );
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pages…"
          autoFocus
        />
        <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {matches.map((d) => (
            <button
              key={d.id}
              type="button"
              className="hover:bg-accent flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              onClick={() => onPick(d)}
            >
              <span className="flex items-center"><PageIcon name={d.icon} className="text-muted-foreground size-4" /></span>
              <span className="truncate">{d.title || "Untitled"}</span>
            </button>
          ))}
          {!matches.length && (
            <p className="text-muted-foreground py-6 text-center text-xs">
              No pages match.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

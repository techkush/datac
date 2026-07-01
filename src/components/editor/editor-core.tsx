"use client";

import * as React from "react";
import { toast } from "sonner";
import { useEditor } from "./store";
import { BlockList } from "./block-list";
import {
  RuntimeProvider,
  type EditorRuntimeValue,
  type SlashRequest,
  type BlockMenuRequest,
  type MathTarget,
  type FocusRequest,
} from "./runtime";
import {
  SlashMenu,
  BlockMenu,
  InlineToolbar,
  PagePicker,
} from "./floating-menus";
import { MathPanel } from "./math-panel";
import { CommentsPanel } from "./comments-panel";
import type { Block } from "@/lib/datac/types";
import {
  DomRegistry,
  serializeTree,
  newBlock,
  cloneBlock,
  withTrailingParagraph,
  isEditable,
  NON_TURNABLE,
} from "./blocks-util";
import { placeCaret, placeCaretAtOffset } from "@/lib/datac/caret";
import { readAsDataURL } from "@/lib/datac/upload";
import type { BlockTypeDef } from "@/lib/datac/constants";

/* ---- tree path helpers (root + nested columns) ------------------------ */
function indexOfId(list: Block[], id: string): number {
  return list.findIndex((b) => b.id === id);
}

function mapColumn(
  tree: Block[],
  colsId: string,
  i: number,
  fn: (col: Block[]) => Block[],
): Block[] {
  return tree.map((b) => {
    if (b.type === "columns") {
      if (b.id === colsId) {
        const cols = (b.cols || []).slice();
        const res = fn(cols[i] || []);
        cols[i] = res.length ? res : [newBlock("paragraph")];
        return { ...b, cols };
      }
      return {
        ...b,
        cols: (b.cols || []).map((col) => mapColumn(col, colsId, i, fn)),
      };
    }
    return b;
  });
}

function findLocation(
  tree: Block[],
  id: string,
  listId = "root",
): { listId: string; index: number } | null {
  const idx = tree.findIndex((b) => b.id === id);
  if (idx >= 0) return { listId, index: idx };
  for (const b of tree) {
    if (b.type === "columns") {
      const cols = b.cols || [];
      for (let i = 0; i < cols.length; i++) {
        const found = findLocation(cols[i], id, `${b.id}#${i}`);
        if (found) return found;
      }
    }
  }
  return null;
}

export function EditorCore() {
  const store = useEditor();
  const { blocks: seedBlocks, setSerializer, scheduleSave } = store;

  const registry = React.useRef<DomRegistry>(new Map()).current;
  const treeRef = React.useRef<Block[]>(
    withTrailingParagraph(
      seedBlocks.length ? seedBlocks : [newBlock("paragraph")],
    ),
  );
  const [tree, setTreeState] = React.useState<Block[]>(treeRef.current);
  const [epoch, setEpoch] = React.useState(0);
  const pendingFocus = React.useRef<FocusRequest | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const pendingUpload = React.useRef<{ blockId: string; kind: "image" | "file" } | null>(
    null,
  );

  // floating UI
  const [slash, setSlash] = React.useState<SlashRequest | null>(null);
  const [blockMenu, setBlockMenu] = React.useState<BlockMenuRequest | null>(null);
  const [mathTarget, setMathTarget] = React.useState<MathTarget | null>(null);
  const [commentBid, setCommentBid] = React.useState<string | null>(null);
  const [pagePicker, setPagePicker] = React.useState<{
    rect: DOMRect;
    cb: (id: string) => void;
  } | null>(null);

  // history
  const history = React.useRef<string[]>([]);
  const histIndex = React.useRef(-1);
  const histTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const serialize = React.useCallback(
    () => serializeTree(registry, treeRef.current),
    [registry],
  );

  const commit = React.useCallback((next: Block[]) => {
    treeRef.current = next;
    setTreeState(next);
  }, []);

  const captureHistory = React.useCallback(() => {
    if (histTimer.current) clearTimeout(histTimer.current);
    const snap = JSON.stringify(serialize());
    if (histIndex.current >= 0 && snap === history.current[histIndex.current])
      return;
    history.current = history.current.slice(0, histIndex.current + 1);
    history.current.push(snap);
    if (history.current.length > 200) history.current.shift();
    histIndex.current = history.current.length - 1;
  }, [serialize]);

  const scheduleHistory = React.useCallback(() => {
    if (histTimer.current) clearTimeout(histTimer.current);
    histTimer.current = setTimeout(captureHistory, 450);
  }, [captureHistory]);

  const markChanged = React.useCallback(() => {
    scheduleSave();
    scheduleHistory();
  }, [scheduleSave, scheduleHistory]);

  // register serializer + seed history on mount
  React.useEffect(() => {
    setSerializer(serialize);
    history.current = [JSON.stringify(treeRef.current)];
    histIndex.current = 0;
    return () => setSerializer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // apply pending focus after each render
  React.useEffect(() => {
    const req = pendingFocus.current;
    if (!req) return;
    pendingFocus.current = null;
    const el = registry.get(req.id);
    if (el) {
      if (req.offset != null) placeCaretAtOffset(el, req.offset);
      else placeCaret(el, req.atEnd);
    }
  }, [tree, epoch, registry]);

  const requestFocus = React.useCallback((req: FocusRequest) => {
    pendingFocus.current = req;
  }, []);

  const mutateList = React.useCallback(
    (listId: string, fn: (blocks: Block[]) => Block[]) => {
      const fresh = serialize();
      let next: Block[];
      if (listId === "root") {
        next = withTrailingParagraph(fn(fresh));
      } else {
        const [colsId, iStr] = listId.split("#");
        next = mapColumn(fresh, colsId, +iStr, fn);
      }
      commit(next);
      markChanged();
    },
    [serialize, commit, markChanged],
  );

  const getList = React.useCallback(
    (listId: string): Block[] => {
      const fresh = serialize();
      if (listId === "root") return fresh;
      const loc = fresh;
      const [colsId, iStr] = listId.split("#");
      let found: Block[] = [];
      const search = (nodes: Block[]) => {
        for (const b of nodes) {
          if (b.type === "columns") {
            if (b.id === colsId) found = b.cols?.[+iStr] || [];
            else (b.cols || []).forEach(search);
          }
        }
      };
      search(loc);
      return found;
    },
    [serialize],
  );

  const moveBlock = React.useCallback(
    (fromListId: string, blockId: string, toListId: string, toIndex: number) => {
      const fresh = serialize();
      const loc = findLocation(fresh, blockId);
      if (!loc) return;
      // pull the block out
      let moved: Block | null = null;
      const removeFrom = (list: Block[]) => {
        const idx = indexOfId(list, blockId);
        if (idx < 0) return list;
        moved = list[idx];
        return list.filter((_, i) => i !== idx);
      };
      let stage: Block[];
      if (loc.listId === "root") stage = removeFrom(fresh);
      else {
        const [cId, iStr] = loc.listId.split("#");
        stage = mapColumn(fresh, cId, +iStr, removeFrom);
      }
      if (!moved) return;
      const insertInto = (list: Block[]) => {
        const clamped = Math.max(0, Math.min(toIndex, list.length));
        const copy = list.slice();
        copy.splice(clamped, 0, moved!);
        return copy;
      };
      let next: Block[];
      if (toListId === "root") next = withTrailingParagraph(insertInto(stage));
      else {
        const [cId, iStr] = toListId.split("#");
        next = mapColumn(stage, cId, +iStr, insertInto);
      }
      commit(next);
      markChanged();
      captureHistory();
    },
    [serialize, commit, markChanged, captureHistory],
  );

  /* ---- block operations for the block menu ---- */
  const withBlock = React.useCallback(
    (blockId: string, fn: (list: Block[], index: number) => Block[]) => {
      const loc = findLocation(serialize(), blockId);
      if (!loc) return;
      mutateList(loc.listId, (list) => {
        const idx = indexOfId(list, blockId);
        if (idx < 0) return list;
        return fn(list, idx);
      });
    },
    [serialize, mutateList],
  );

  const deleteBlock = React.useCallback(
    (blockId: string) => {
      const cur = serialize();
      const loc = findLocation(cur, blockId);
      const b = loc
        ? (loc.listId === "root"
            ? cur[loc.index]
            : getList(loc.listId)[loc.index])
        : null;
      if (b && b.type === "page" && b.pageId && !b.link) {
        store.orphanPage(b.pageId);
      }
      withBlock(blockId, (list, index) => list.filter((_, i) => i !== index));
      captureHistory();
    },
    [serialize, getList, store, withBlock, captureHistory],
  );

  const duplicateBlock = React.useCallback(
    (blockId: string) => {
      withBlock(blockId, (list, index) => {
        const copy = cloneBlock(list[index]);
        const next = list.slice();
        next.splice(index + 1, 0, copy);
        return next;
      });
      captureHistory();
    },
    [withBlock, captureHistory],
  );

  const turnInto = React.useCallback(
    (blockId: string, type: string) => {
      withBlock(blockId, (list, index) => {
        const b = list[index];
        if (NON_TURNABLE.has(b.type)) return list;
        const next = list.slice();
        next[index] = { ...b, type: type as Block["type"] };
        return next;
      });
      requestFocus({ id: blockId, atEnd: true });
      captureHistory();
    },
    [withBlock, requestFocus, captureHistory],
  );

  const setColor = React.useCallback(
    (blockId: string, kind: "tc" | "bg", name: string) => {
      withBlock(blockId, (list, index) => {
        const b = list[index];
        const props = { ...(b.props as Record<string, unknown>) };
        if (!name || name === "default") delete props[kind];
        else props[kind] = name;
        const next = list.slice();
        next[index] = { ...b, props };
        return next;
      });
    },
    [withBlock],
  );

  /* ---- uploads ---- */
  const requestUpload = React.useCallback(
    (_listId: string, blockId: string, kind: "image" | "file") => {
      pendingUpload.current = { blockId, kind };
      if (fileInput.current) {
        fileInput.current.accept = kind === "image" ? "image/*" : "";
        fileInput.current.click();
      }
    },
    [],
  );

  const onFilePicked = React.useCallback(
    async (file: File) => {
      const pending = pendingUpload.current;
      pendingUpload.current = null;
      if (!pending) return;
      const isImage = pending.kind === "image" || file.type.startsWith("image/");
      toast.loading("Uploading…", { id: "upload" });
      try {
        const res = await store.client.upload(file.name, await readAsDataURL(file));
        if (!res.url) throw new Error();
        const nb: Block = isImage
          ? { id: pending.blockId, type: "image", url: res.url, alt: file.name }
          : {
              id: pending.blockId,
              type: "file",
              url: res.url,
              name: file.name,
              size: res.size,
            };
        const para = newBlock("paragraph");
        withBlock(pending.blockId, (list, index) => {
          const next = list.slice();
          next[index] = nb;
          next.splice(index + 1, 0, para);
          return next;
        });
        requestFocus({ id: para.id });
        captureHistory();
        toast.success("Uploaded", { id: "upload" });
      } catch {
        toast.error("Upload failed", { id: "upload" });
      }
    },
    [store.client, withBlock, requestFocus, captureHistory],
  );

  /* ---- slash command apply ---- */
  const applySlash = React.useCallback(
    async (item: BlockTypeDef) => {
      const req = slash;
      setSlash(null);
      if (!req) return;
      const blockId = req.blockId;
      // clear the "/query" text from the live DOM (block is focused, so the
      // contentEditable won't re-sync from state on its own)
      const el = registry.get(blockId);
      if (el) el.innerHTML = "";
      const clear = (b: Block): Block => ({ ...b, html: "" });

      if (!item.action) {
        withBlock(blockId, (list, index) => {
          const next = list.slice();
          next[index] = { ...clear(next[index]), type: item.type as Block["type"] };
          return next;
        });
        requestFocus({ id: blockId, atEnd: true });
        captureHistory();
        return;
      }

      if (item.action === "divider") {
        const para = newBlock("paragraph");
        withBlock(blockId, (list, index) => {
          const next = list.slice();
          next[index] = { id: next[index].id, type: "divider" };
          next.splice(index + 1, 0, para);
          return next;
        });
        requestFocus({ id: para.id });
        captureHistory();
        return;
      }

      if (item.action === "columns") {
        const n = item.n || 2;
        const cols: Block[][] = Array.from({ length: n }, () => [
          newBlock("paragraph"),
        ]);
        const colsBlock: Block = {
          id: newBlock("columns").id,
          type: "columns",
          cols,
        };
        const para = newBlock("paragraph");
        let firstCellId = "";
        withBlock(blockId, (list, index) => {
          const next = list.slice();
          next[index] = colsBlock;
          next.splice(index + 1, 0, para);
          firstCellId = cols[0][0].id;
          return next;
        });
        requestFocus({ id: firstCellId });
        captureHistory();
        return;
      }

      if (item.action === "image" || item.action === "file") {
        requestUpload("", blockId, item.action);
        return;
      }

      if (item.action === "math") {
        // convert this block into an (empty) math block and open the panel
        withBlock(blockId, (list, index) => {
          const next = list.slice();
          next[index] = { id: next[index].id, type: "math", tex: "" };
          return next;
        });
        setMathTarget({ listId: "", blockId, mode: "insert" });
        return;
      }

      if (item.action === "page") {
        const childId = await store.createChildPage();
        if (!childId) return;
        const para = newBlock("paragraph");
        withBlock(blockId, (list, index) => {
          const next = list.slice();
          next[index] = { id: next[index].id, type: "page", pageId: childId, note: "" };
          next.splice(index + 1, 0, para);
          return next;
        });
        captureHistory();
        await store.saveNow();
        await store.refreshDocs();
        store.openDoc(childId);
        return;
      }

      if (item.action === "pagelink") {
        const rect = req.rect;
        setPagePicker({
          rect,
          cb: (pageId) => {
            setPagePicker(null);
            const para = newBlock("paragraph");
            withBlock(blockId, (list, index) => {
              const next = list.slice();
              next[index] = {
                id: next[index].id,
                type: "page",
                pageId,
                link: true,
                note: "",
              };
              next.splice(index + 1, 0, para);
              return next;
            });
            requestFocus({ id: para.id });
            captureHistory();
          },
        });
        return;
      }

      if (item.action === "linkfile") {
        toast.loading("Choose a file…", { id: "pick" });
        const res = await store.client.pickFile();
        toast.dismiss("pick");
        if (!res || !res.path) return;
        const para = newBlock("paragraph");
        withBlock(blockId, (list, index) => {
          const next = list.slice();
          next[index] = {
            id: next[index].id,
            type: "linkfile",
            path: res.path,
            name: res.name || res.path,
            note: "",
          };
          next.splice(index + 1, 0, para);
          return next;
        });
        requestFocus({ id: para.id });
        captureHistory();
        return;
      }
    },
    [slash, withBlock, requestFocus, captureHistory, requestUpload, store],
  );

  /* ---- math commit ---- */
  const commitMath = React.useCallback(
    (tex: string) => {
      const t = mathTarget;
      setMathTarget(null);
      if (!t) return;
      if (!tex) {
        // empty → drop the math block
        deleteBlock(t.blockId);
        return;
      }
      withBlock(t.blockId, (list, index) => {
        const next = list.slice();
        next[index] = { ...next[index], type: "math", tex };
        return next;
      });
      captureHistory();
    },
    [mathTarget, withBlock, deleteBlock, captureHistory],
  );

  /* ---- undo / redo ---- */
  const restore = React.useCallback(
    (snap: string) => {
      const parsed = JSON.parse(snap) as Block[];
      commit(parsed);
      setEpoch((e) => e + 1);
      scheduleSave();
    },
    [commit, scheduleSave],
  );
  const undo = React.useCallback(() => {
    if (histTimer.current) clearTimeout(histTimer.current);
    captureHistory();
    if (histIndex.current <= 0) return;
    histIndex.current -= 1;
    restore(history.current[histIndex.current]);
  }, [captureHistory, restore]);
  const redo = React.useCallback(() => {
    if (histIndex.current >= history.current.length - 1) return;
    histIndex.current += 1;
    restore(history.current[histIndex.current]);
  }, [restore]);

  // Undo/redo/save at the document level so they work even when focus has
  // left the editor (e.g. right after an undo remounts the blocks). Inputs and
  // textareas keep their native behaviour.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const ae = document.activeElement;
      if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (k === "y") {
        e.preventDefault();
        redo();
      } else if (k === "s") {
        e.preventDefault();
        store.saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, store]);

  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    // inline format shortcuts (need a live selection in the editor)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === "b" || k === "i" || k === "u") {
        e.preventDefault();
        document.execCommand(
          k === "b" ? "bold" : k === "i" ? "italic" : "underline",
        );
        markChanged();
      }
    }
  };

  const runtime: EditorRuntimeValue = {
    registry,
    register: (id, el) => {
      if (el) registry.set(id, el);
      else registry.delete(id);
    },
    requestFocus,
    docs: store.docs,
    client: store.client,
    openDoc: store.openDoc,
    mutateList,
    getList,
    moveBlock,
    markChanged,
    captureHistory,
    openSlash: setSlash,
    openBlockMenu: setBlockMenu,
    openMath: setMathTarget,
    openComments: setCommentBid,
    openPagePicker: (rect, cb) => setPagePicker({ rect, cb }),
    requestUpload,
    createChildPage: store.createChildPage,
    comments: store.comments,
  };

  const currentMathTex =
    mathTarget &&
    (findMathTex(treeRef.current, mathTarget.blockId) ?? "");

  return (
    <RuntimeProvider value={runtime}>
      <div
        ref={rootRef}
        className="relative pb-40 text-[15px] leading-relaxed"
        onKeyDownCapture={onKeyDownCapture}
        onMouseDown={(e) => {
          // click below content → focus/append a trailing paragraph
          if (e.target === rootRef.current) {
            const last = treeRef.current[treeRef.current.length - 1];
            if (last && isEditable(last.type)) placeCaret(registry.get(last.id)!, true);
          }
        }}
      >
        <div key={epoch}>
          <BlockList listId="root" blocks={tree} />
        </div>
      </div>

      {slash && (
        <SlashMenu
          rect={slash.rect}
          query={slash.query}
          onPick={applySlash}
          onClose={() => setSlash(null)}
        />
      )}
      {blockMenu && (
        <BlockMenu
          rect={blockMenu.rect}
          onClose={() => setBlockMenu(null)}
          onDelete={() => deleteBlock(blockMenu.blockId)}
          onDuplicate={() => duplicateBlock(blockMenu.blockId)}
          onTurnInto={(type) => turnInto(blockMenu.blockId, type)}
          onColor={(kind, name) => setColor(blockMenu.blockId, kind, name)}
        />
      )}
      {pagePicker && (
        <PagePicker
          rect={pagePicker.rect}
          docs={store.docs}
          currentId={store.currentId}
          onPick={pagePicker.cb}
          onClose={() => setPagePicker(null)}
        />
      )}
      <InlineToolbar rootRef={rootRef} onChange={markChanged} />
      <MathPanel
        open={!!mathTarget}
        mode={mathTarget?.mode || "insert"}
        initialTex={currentMathTex || ""}
        onCommit={commitMath}
        onClose={() => {
          // if inserting and cancelled with no tex, remove the empty math block
          if (mathTarget?.mode === "insert") {
            const tex = findMathTex(treeRef.current, mathTarget.blockId);
            if (!tex) deleteBlock(mathTarget.blockId);
          }
          setMathTarget(null);
        }}
      />
      <CommentsPanel bid={commentBid} onClose={() => setCommentBid(null)} />

      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFilePicked(f);
        }}
      />
    </RuntimeProvider>
  );
}

function findMathTex(tree: Block[], id: string): string | null {
  for (const b of tree) {
    if (b.id === id && b.type === "math") return (b.tex as string) || "";
    if (b.type === "columns") {
      for (const col of b.cols || []) {
        const r = findMathTex(col, id);
        if (r != null) return r;
      }
    }
  }
  return null;
}

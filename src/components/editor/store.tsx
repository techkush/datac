"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient, type DatacClient, type FullDoc } from "@/lib/datac/client";
import type { Block, DocSummary } from "@/lib/datac/types";
import { parseMarkdownToBlocks, blockJsonToMd } from "@/lib/datac/markdown";
import { randomId } from "@/lib/datac/constants";

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface DocMeta {
  title: string;
  icon: string;
  cover: string;
  parent: string;
  status: string;
}

interface EditorContextValue {
  client: DatacClient;
  projectTitle: string;
  projectDir: string;
  docs: DocSummary[];
  currentId: string | null;
  meta: DocMeta;
  blocks: Block[];
  comments: Record<string, CommentEntry[]>;
  saveState: SaveState;

  refreshDocs: () => Promise<void>;
  openDoc: (id: string) => Promise<void>;
  newDoc: () => Promise<void>;
  deleteDoc: (id: string) => Promise<void>;
  duplicateDoc: (id: string) => Promise<void>;
  renameDoc: (id: string, title: string) => Promise<void>;
  orphanPage: (id: string) => Promise<void>;
  restorePage: (id: string) => Promise<void>;
  reattachPage: (id: string) => Promise<void>;
  createChildPage: () => Promise<string | null>;

  setMeta: (patch: Partial<DocMeta>) => void;
  setBlocks: (blocks: Block[]) => void;
  setComments: (c: Record<string, CommentEntry[]>) => void;
  saveNow: (keepalive?: boolean) => Promise<void>;
  exportMarkdown: (id?: string) => Promise<void>;
}

export interface CommentEntry {
  text: string;
  at: string;
  by: string;
}

const EditorContext = React.createContext<EditorContextValue | null>(null);

export function useEditor(): EditorContextValue {
  const ctx = React.useContext(EditorContext);
  if (!ctx) throw new Error("useEditor must be used within EditorProvider");
  return ctx;
}

const EMPTY_META: DocMeta = {
  title: "",
  icon: "",
  cover: "",
  parent: "",
  status: "",
};

export function EditorProvider({
  ws,
  initialInfo,
  initialDocs,
  children,
}: {
  ws: string;
  initialInfo: { title: string; projectDir?: string };
  initialDocs: DocSummary[];
  children: React.ReactNode;
}) {
  const client = React.useMemo(() => createClient(ws), [ws]);
  const [docs, setDocs] = React.useState<DocSummary[]>(initialDocs);
  const [currentId, setCurrentId] = React.useState<string | null>(null);
  const [meta, setMetaState] = React.useState<DocMeta>(EMPTY_META);
  const [blocks, setBlocksState] = React.useState<Block[]>([]);
  const [comments, setCommentsState] = React.useState<
    Record<string, CommentEntry[]>
  >({});
  const [saveState, setSaveState] = React.useState<SaveState>("idle");

  // Live refs so the debounced save always reads the latest values.
  const metaRef = React.useRef(meta);
  const blocksRef = React.useRef(blocks);
  const commentsRef = React.useRef(comments);
  const currentIdRef = React.useRef(currentId);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  metaRef.current = meta;
  blocksRef.current = blocks;
  commentsRef.current = comments;
  currentIdRef.current = currentId;

  const refreshDocs = React.useCallback(async () => {
    setDocs(await client.list());
  }, [client]);

  const buildDocFields = React.useCallback(() => {
    const m = metaRef.current;
    return {
      title: m.title.trim() || "Untitled",
      icon: m.icon,
      cover: m.cover,
      parent: m.parent,
      status: m.status,
      blocks: blocksRef.current,
      comments: commentsRef.current as Record<string, unknown>,
    };
  }, []);

  const saveNow = React.useCallback(
    async (keepalive = false) => {
      const id = currentIdRef.current;
      if (!id || savingRef.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      savingRef.current = true;
      const fields = buildDocFields();
      try {
        await client.save(id, fields, keepalive);
        dirtyRef.current = false;
        setSaveState("saved");
        setDocs((ds) =>
          ds.map((d) =>
            d.id === id
              ? { ...d, title: fields.title, icon: fields.icon }
              : d,
          ),
        );
      } catch {
        setSaveState("error");
      } finally {
        savingRef.current = false;
        if (dirtyRef.current) queueSave();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, buildDocFields],
  );

  const queueSave = React.useCallback(() => {
    if (!currentIdRef.current) return;
    dirtyRef.current = true;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveNow(), 700);
  }, [saveNow]);

  const setMeta = React.useCallback(
    (patch: Partial<DocMeta>) => {
      setMetaState((m) => {
        const next = { ...m, ...patch };
        metaRef.current = next;
        return next;
      });
      queueSave();
    },
    [queueSave],
  );

  const setBlocks = React.useCallback(
    (next: Block[]) => {
      blocksRef.current = next;
      setBlocksState(next);
      queueSave();
    },
    [queueSave],
  );

  const setComments = React.useCallback(
    (c: Record<string, CommentEntry[]>) => {
      commentsRef.current = c;
      setCommentsState(c);
      queueSave();
    },
    [queueSave],
  );

  const openDoc = React.useCallback(
    async (id: string) => {
      if (dirtyRef.current) await saveNow();
      const doc: FullDoc = await client.get(id);
      if (doc.error) {
        toast.error("Could not open page");
        return;
      }
      let nextBlocks: Block[];
      let migrated = false;
      if (doc.format === "markdown") {
        nextBlocks = parseMarkdownToBlocks(doc.content || "", doc.styles || {});
        migrated = true;
      } else {
        nextBlocks = Array.isArray(doc.blocks) ? doc.blocks : [];
      }
      const nextMeta: DocMeta = {
        title: doc.title === "Untitled" ? "" : doc.title || "",
        icon: doc.icon || "",
        cover: doc.cover || "",
        parent: doc.parent || "",
        status: doc.status || "",
      };
      const nextComments = (doc.comments || {}) as Record<string, CommentEntry[]>;
      metaRef.current = nextMeta;
      blocksRef.current = nextBlocks;
      commentsRef.current = nextComments;
      currentIdRef.current = id;
      dirtyRef.current = false;
      setCurrentId(id);
      setMetaState(nextMeta);
      setBlocksState(nextBlocks);
      setCommentsState(nextComments);
      setSaveState("saved");
      if (migrated) {
        dirtyRef.current = true;
        await saveNow();
      }
    },
    [client, saveNow],
  );

  const newDoc = React.useCallback(async () => {
    if (dirtyRef.current) await saveNow();
    const created = await client.create();
    await refreshDocs();
    await openDoc(created.id);
  }, [client, refreshDocs, openDoc, saveNow]);

  const deleteDoc = React.useCallback(
    async (id: string) => {
      await client.remove(id);
      if (currentIdRef.current === id) {
        currentIdRef.current = null;
        setCurrentId(null);
      }
      await refreshDocs();
      toast.success("Page deleted");
    },
    [client, refreshDocs],
  );

  const createChildPage = React.useCallback(async () => {
    if (dirtyRef.current) await saveNow();
    const created = await client.create({
      title: "Untitled",
      blocks: [],
      parent: currentIdRef.current || "",
    });
    return created.id;
  }, [client, saveNow]);

  const duplicateDoc = React.useCallback(
    async (id: string) => {
      if (id === currentIdRef.current && dirtyRef.current) await saveNow();
      let full = await client.get(id);
      if (full.format === "markdown") {
        await openDoc(id);
        await saveNow();
        full = await client.get(id);
      }
      const copy = await client.create({
        title: (full.title || "Untitled") + " copy",
        icon: full.icon,
        cover: full.cover,
        blocks: full.blocks || [],
        comments: full.comments,
      });
      await refreshDocs();
      await openDoc(copy.id);
    },
    [client, openDoc, refreshDocs, saveNow],
  );

  const renameDoc = React.useCallback(
    async (id: string, title: string) => {
      if (id === currentIdRef.current) {
        setMeta({ title: title === "Untitled" ? "" : title });
      } else {
        const full = await client.get(id);
        await client.save(id, { ...full, title: title || "Untitled" });
        await refreshDocs();
      }
    },
    [client, refreshDocs, setMeta],
  );

  const docFields = (d: FullDoc) => ({
    title: d.title,
    icon: d.icon,
    cover: d.cover,
    parent: d.parent || "",
    status: d.status || "",
    blocks: d.blocks || [],
    comments: d.comments,
    orphaned: !!d.orphaned,
  });

  const orphanPage = React.useCallback(
    async (id: string) => {
      const d = await client.get(id);
      if (d && !d.error) {
        await client.save(id, { ...docFields(d), orphaned: true });
        await refreshDocs();
      }
    },
    [client, refreshDocs],
  );

  const restorePage = React.useCallback(
    async (id: string) => {
      const d = await client.get(id);
      if (d && !d.error) {
        await client.save(id, { ...docFields(d), orphaned: false, parent: "" });
        await refreshDocs();
      }
    },
    [client, refreshDocs],
  );

  const reattachPage = React.useCallback(
    async (id: string) => {
      const child = await client.get(id);
      if (!child || child.error) return;
      const parentId = child.parent;
      const parentInList = docs.find((d) => d.id === parentId);
      if (!parentId || !parentInList) {
        await restorePage(id);
        return;
      }
      await client.save(id, { ...docFields(child), orphaned: false });
      const parent = await client.get(parentId);
      if (parent && !parent.error) {
        const pb = (parent.blocks || []).slice();
        if (!pb.some((b) => b.type === "page" && b.pageId === id))
          pb.push({ id: randomId(), type: "page", pageId: id, note: "" });
        await client.save(parentId, { ...docFields(parent), blocks: pb });
      }
      await refreshDocs();
    },
    [client, docs, refreshDocs, restorePage],
  );

  const exportMarkdown = React.useCallback(
    async (id?: string) => {
      const target = id || currentIdRef.current;
      if (!target) return;
      if (dirtyRef.current) await saveNow();
      const seen = new Set<string>();
      const pageToMd = async (pageId: string, level: number): Promise<string> => {
        if (seen.has(pageId)) return "";
        seen.add(pageId);
        const doc = await client.get(pageId);
        if (!doc || doc.error) return "";
        const h = "#".repeat(Math.min(level, 6));
        let out = `${h} ${doc.icon ? doc.icon + " " : ""}${doc.title || "Untitled"}\n\n`;
        for (const b of doc.blocks || []) {
          if (b.type === "page" && b.pageId)
            out += (await pageToMd(b.pageId, level + 1)) + "\n";
          else out += blockJsonToMd(b) + "\n\n";
        }
        return out;
      };
      const md = await pageToMd(target, 1);
      const blob = new Blob([md], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const name = docs.find((d) => d.id === target)?.title || "Untitled";
      a.download = name.replace(/[^\w-]+/g, "_").slice(0, 60) + ".md";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    [client, docs, saveNow],
  );

  // Save on unload / tab hide.
  React.useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) saveNow(true);
    };
    window.addEventListener("beforeunload", flush);
    const vis = () => {
      if (document.hidden) flush();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [saveNow]);

  // Open the first top-level page on mount.
  const booted = React.useRef(false);
  React.useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const first = initialDocs.find((d) => !d.parent) || initialDocs[0];
    if (first) openDoc(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: EditorContextValue = {
    client,
    projectTitle: initialInfo.title,
    projectDir: initialInfo.projectDir || "",
    docs,
    currentId,
    meta,
    blocks,
    comments,
    saveState,
    refreshDocs,
    openDoc,
    newDoc,
    deleteDoc,
    duplicateDoc,
    renameDoc,
    orphanPage,
    restorePage,
    reattachPage,
    createChildPage,
    setMeta,
    setBlocks,
    setComments,
    saveNow,
    exportMarkdown,
  };

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

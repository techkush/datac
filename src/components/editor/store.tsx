"use client";

import * as React from "react";
import { toast } from "sonner";
import { createClient, type DatacClient, type FullDoc } from "@/lib/datac/client";
import type { Block, DocSummary } from "@/lib/datac/types";
import { parseMarkdownToBlocks, blockJsonToMd } from "@/lib/datac/markdown";
import { randomId } from "@/lib/datac/constants";
import {
  isBlockNoteDoc,
  legacyToBlockNote,
  blockNoteToMd,
  type BnBlock,
} from "@/lib/datac/blocknote-convert";

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
  booting: boolean; // initial page open still in flight

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
  exportHtml: (id?: string) => Promise<void>;
  exportPdf: (id: string | undefined, mode: "paged" | "pageless") => Promise<void>;
  // The editor registers a serializer that reads live block content from the
  // DOM; the store calls it when building the doc to save.
  setSerializer: (fn: (() => Block[]) | null) => void;
  // The editor registers a blocks→HTML converter for the HTML/PDF exporters.
  setHtmlExporter: (fn: ((blocks: Block[]) => string) | null) => void;
  scheduleSave: () => void;
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

const escapeHtml = (s: string) =>
  s.replace(/[&<>]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
  );

// A doc icon is either an emoji (worth showing in exports) or a lucide icon
// NAME like "FileText" (UI-only ASCII, must NOT print as text). Returns the
// emoji + trailing space, or "" for a name/empty.
const emojiIconPrefix = (icon?: string) =>
  icon && [...icon].some((c) => (c.codePointAt(0) || 0) > 127)
    ? icon + " "
    : "";

// Wrap exported body HTML in a standalone, self-contained document. `mode`
// tunes the @page rules for PDF printing (paged = A4 pages, pageless = one
// continuous page whose size is set just before printing).
function fullHtmlDoc(
  title: string,
  body: string,
  mode?: "paged" | "pageless",
): string {
  // paged → A4 pages with breaks. pageless → one deterministic-width column
  // (the @page size is set to the content box just before printing).
  const page =
    mode === "paged"
      ? "@page { size: A4; margin: 16mm; } body { max-width: none; margin: 0; padding: 18mm; }"
      : mode === "pageless"
        ? "body { width: 720px; max-width: none; margin: 0; padding: 32px; }"
        : "";
  const bg: Record<string, string> = {
    gray: "#ebeced", brown: "#e9e5e3", red: "#fbe4e4", orange: "#f6e9d9",
    yellow: "#fbf3db", green: "#ddedea", blue: "#ddebf1", purple: "#eae4f2",
    pink: "#f4dfeb",
  };
  const fg: Record<string, string> = {
    gray: "#9b9a97", brown: "#64473a", red: "#e03e3e", orange: "#d9730d",
    yellow: "#dfab01", green: "#4d6461", blue: "#0b6e99", purple: "#6940a5",
    pink: "#ad1a72",
  };
  const colorCss =
    Object.entries(bg)
      .map(([k, v]) => `[data-background-color=${k}]{background-color:${v};}`)
      .join("") +
    Object.entries(fg)
      .map(([k, v]) => `[data-text-color=${k}]{color:${v};}`)
      .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>
${page}
* { box-sizing: border-box; }
/* Keep background highlights when printing to PDF. */
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.6; max-width: 780px; margin: 0 auto; padding: 24px; }
h1,h2,h3,h4,h5,h6 { line-height: 1.25; margin: 1.4em 0 0.5em; }
img { max-width: 100%; height: auto; }
pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow: auto; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em; }
blockquote { border-left: 3px solid #ddd; margin: 0.8em 0; padding-left: 1em; color: #555; }
table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 6px 10px; }
[data-text-alignment=center]{ text-align: center; } [data-text-alignment=right]{ text-align: right; } [data-text-alignment=justify]{ text-align: justify; }
${colorCss}
</style></head><body>${body}</body></html>`;
}

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
  const [booting, setBooting] = React.useState(true);

  // Live refs so the debounced save always reads the latest values.
  const metaRef = React.useRef(meta);
  const blocksRef = React.useRef(blocks);
  const commentsRef = React.useRef(comments);
  const currentIdRef = React.useRef(currentId);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const failedRef = React.useRef(false); // a save has failed and a retry is pending
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  metaRef.current = meta;
  blocksRef.current = blocks;
  commentsRef.current = comments;
  currentIdRef.current = currentId;

  const refreshDocs = React.useCallback(async () => {
    setDocs(await client.list());
  }, [client]);

  const serializerRef = React.useRef<(() => Block[]) | null>(null);
  const setSerializer = React.useCallback((fn: (() => Block[]) | null) => {
    serializerRef.current = fn;
  }, []);

  // The live editor registers a blocks→HTML converter here (BlockNote's
  // blocksToHTMLLossy, which understands the custom schema). Used by the
  // HTML and PDF exporters.
  const htmlExporterRef = React.useRef<((blocks: Block[]) => string) | null>(
    null,
  );
  const setHtmlExporter = React.useCallback(
    (fn: ((blocks: Block[]) => string) | null) => {
      htmlExporterRef.current = fn;
    },
    [],
  );

  const buildDocFields = React.useCallback(() => {
    const m = metaRef.current;
    let blocks = serializerRef.current
      ? serializerRef.current()
      : blocksRef.current;
    // A serializer reporting an empty document while we hold real blocks
    // means the editor hasn't finished loading — never save that state.
    if ((!blocks || !blocks.length) && blocksRef.current.length) {
      blocks = blocksRef.current;
    }
    blocksRef.current = blocks;
    return {
      title: m.title.trim() || "Untitled",
      icon: m.icon,
      cover: m.cover,
      parent: m.parent,
      status: m.status,
      blocks,
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
      // Clear dirty *before* the request: an edit that races the in-flight
      // save re-sets it to true and gets requeued in finally. Clearing it
      // after a resolved await would clobber that newer edit and lose it.
      dirtyRef.current = false;
      try {
        await client.save(id, fields, keepalive);
        if (failedRef.current) toast.success("Back online — page saved");
        failedRef.current = false;
        setSaveState("saved");
        setDocs((ds) =>
          ds.map((d) =>
            d.id === id
              ? {
                  ...d,
                  title: fields.title,
                  icon: fields.icon,
                  status: fields.status,
                  parent: fields.parent,
                }
              : d,
          ),
        );
      } catch {
        dirtyRef.current = true; // restore so the retry re-sends this edit
        setSaveState("error");
        if (!failedRef.current) {
          toast.error("Save failed — retrying in the background");
        }
        failedRef.current = true;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => saveNow(), 3000);
      } finally {
        savingRef.current = false;
        if (dirtyRef.current && !failedRef.current) queueSave();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, buildDocFields],
  );

  // Autosave: every content change debounces a save (~0.7s after you stop).
  // The database is local, so frequent saves are cheap; tab close/hide and
  // page switches also flush.
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
      // Legacy block format → BlockNote document (one-time; the server
      // keeps a .bak of the original file on the first converted save).
      if (nextBlocks.length && !isBlockNoteDoc(nextBlocks)) {
        nextBlocks = legacyToBlockNote(nextBlocks) as unknown as Block[];
        migrated = true;
      }
      const nextMeta: DocMeta = {
        title: doc.title === "Untitled" ? "" : doc.title || "",
        icon: doc.icon || "",
        cover: doc.cover || "",
        parent: doc.parent || "",
        status: doc.status || "",
      };
      const nextComments = (doc.comments || {}) as Record<string, CommentEntry[]>;
      // Drop the previous doc's DOM serializer; the new editor re-registers.
      serializerRef.current = null;
      metaRef.current = nextMeta;
      blocksRef.current = nextBlocks;
      commentsRef.current = nextComments;
      currentIdRef.current = id;
      dirtyRef.current = false;
      // Reflect the open page in the URL (?doc=<id>) so a browser refresh
      // reopens this page instead of falling back to the first one.
      try {
        const url = new URL(window.location.href);
        url.searchParams.set("doc", id);
        window.history.replaceState(null, "", url.toString());
      } catch {}
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
        const hasRef = pb.some(
          (b) =>
            b.type === "page" &&
            (b.pageId === id ||
              (b.props as { pageId?: string } | undefined)?.pageId === id),
        );
        if (!hasRef) {
          if (!pb.length || isBlockNoteDoc(pb))
            pb.push({
              id: randomId(),
              type: "page",
              props: { pageId: id, link: false, note: "" },
            } as Block);
          else pb.push({ id: randomId(), type: "page", pageId: id, note: "" });
        }
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
        let out = `${h} ${emojiIconPrefix(doc.icon)}${doc.title || "Untitled"}\n\n`;
        const bn = isBlockNoteDoc(doc.blocks);
        const walk = async (blocks: Block[]) => {
          for (const b of blocks || []) {
            const pageId =
              b.type === "page"
                ? ((b.props as { pageId?: string } | undefined)?.pageId ??
                  (b.pageId as string | undefined))
                : undefined;
            if (pageId) {
              out += (await pageToMd(pageId, level + 1)) + "\n";
              continue;
            }
            if (bn) {
              const kids = (b as unknown as BnBlock).children;
              const t = b.type as string;
              const isLayout = t === "columnList" || t === "column";
              if (!isLayout) out += blockNoteToMd(b as unknown as BnBlock) + "\n\n";
              if (isLayout && Array.isArray(kids)) await walk(kids as unknown as Block[]);
            } else {
              out += blockJsonToMd(b) + "\n\n";
            }
          }
        };
        await walk(doc.blocks || []);
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

  // Build the export HTML body for a page and its nested sub-pages, using the
  // live editor's blocks→HTML converter (registered via setHtmlExporter).
  const buildDocHtml = React.useCallback(
    async (target: string): Promise<string> => {
      const toHtml = htmlExporterRef.current;
      const seen = new Set<string>();
      const pageToHtml = async (
        pageId: string,
        level: number,
      ): Promise<string> => {
        if (seen.has(pageId)) return "";
        seen.add(pageId);
        const doc = await client.get(pageId);
        if (!doc || doc.error) return "";
        let blocks: Block[] =
          doc.format === "markdown"
            ? parseMarkdownToBlocks(doc.content || "", doc.styles || {})
            : Array.isArray(doc.blocks)
              ? doc.blocks
              : [];
        if (blocks.length && !isBlockNoteDoc(blocks))
          blocks = legacyToBlockNote(blocks) as unknown as Block[];
        const h = Math.min(level, 6);
        let out = `<section><h${h}>${emojiIconPrefix(doc.icon)}${escapeHtml(
          doc.title || "Untitled",
        )}</h${h}>`;
        // Emit runs of normal blocks together (preserves list grouping),
        // recursing into child-page blocks to inline sub-pages in place.
        let run: Block[] = [];
        const flush = () => {
          if (run.length && toHtml) out += toHtml(run);
          run = [];
        };
        for (const b of blocks) {
          const childId =
            b.type === "page"
              ? ((b.props as { pageId?: string } | undefined)?.pageId ??
                (b.pageId as string | undefined))
              : undefined;
          if (childId) {
            flush();
            out += await pageToHtml(childId, level + 1);
          } else {
            run.push(b);
          }
        }
        flush();
        return out + "</section>";
      };
      return pageToHtml(target, 1);
    },
    [client],
  );

  const exportHtml = React.useCallback(
    async (id?: string) => {
      const target = id || currentIdRef.current;
      if (!target) return;
      if (dirtyRef.current) await saveNow();
      const name = docs.find((d) => d.id === target)?.title || "Untitled";
      const html = fullHtmlDoc(name, await buildDocHtml(target));
      const blob = new Blob([html], { type: "text/html" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name.replace(/[^\w-]+/g, "_").slice(0, 60) + ".html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    [buildDocHtml, docs, saveNow],
  );

  // Print to PDF via a hidden iframe → the browser's "Save as PDF". In
  // pageless mode the page height is set to the content height so the PDF is
  // one continuous page; paged mode uses A4 with page breaks.
  const exportPdf = React.useCallback(
    async (id: string | undefined, mode: "paged" | "pageless") => {
      const target = id || currentIdRef.current;
      if (!target) return;
      if (dirtyRef.current) await saveNow();
      const name = docs.find((d) => d.id === target)?.title || "Untitled";
      const html = fullHtmlDoc(name, await buildDocHtml(target), mode);
      const iframe = document.createElement("iframe");
      // A real (offscreen) width is required so the content lays out at its
      // true size — a 0-width iframe would mis-measure the pageless height.
      iframe.style.cssText =
        "position:fixed;left:-10000px;top:0;width:900px;height:1200px;border:0;";
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument!;
      idoc.open();
      idoc.write(html);
      idoc.close();
      // Wait for images to load so nothing is cut off / missing.
      await Promise.all(
        Array.from(idoc.images).map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((r) => {
                img.onload = img.onerror = () => r(null);
              }),
        ),
      );
      if (mode === "pageless") {
        // One page sized exactly to the content box (px → mm at 96dpi), so
        // the whole doc prints as a single continuous page.
        const px2mm = (px: number) => Math.ceil((px / 96) * 25.4);
        const w = px2mm(idoc.body.scrollWidth);
        const h = px2mm(idoc.body.scrollHeight);
        const style = idoc.createElement("style");
        style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }`;
        idoc.head.appendChild(style);
      }
      const win = iframe.contentWindow!;
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 1000);
    },
    [buildDocHtml, docs, saveNow],
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

  // Open the first top-level page on mount — the same first page the sidebar
  // shows (top-level, non-orphaned, ordered by created ascending), not the
  // most recently edited one.
  const booted = React.useRef(false);
  React.useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    // Deep link: ?doc=<id> opens that page directly.
    const wanted = new URLSearchParams(window.location.search).get("doc");
    if (wanted && initialDocs.some((d) => d.id === wanted)) {
      openDoc(wanted).finally(() => setBooting(false));
      return;
    }
    const roots = initialDocs
      .filter((d) => !d.parent && !d.orphaned)
      .sort((a, b) =>
        String(a.created || "").localeCompare(String(b.created || "")),
      );
    const first = roots[0] || initialDocs[0];
    if (first) openDoc(first.id).finally(() => setBooting(false));
    else setBooting(false);
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
    booting,
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
    exportHtml,
    exportPdf,
    setSerializer,
    setHtmlExporter,
    scheduleSave: queueSave,
  };

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

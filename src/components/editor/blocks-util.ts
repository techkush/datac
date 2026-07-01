import type { Block } from "@/lib/datac/types";
import { randomId, TEXT_TYPES } from "@/lib/datac/constants";
import { sanitizeHtml } from "@/lib/datac/markdown";

export function newBlock(type: string, extra: Partial<Block> = {}): Block {
  return { id: randomId(), type: type as Block["type"], html: "", ...extra };
}

export function isTextType(type: string): boolean {
  return TEXT_TYPES.has(type);
}

export function isEditable(type: string): boolean {
  return TEXT_TYPES.has(type) || type === "code";
}

export const NON_TURNABLE = new Set([
  "image",
  "file",
  "linkfile",
  "page",
  "divider",
  "columns",
  "table",
  "math",
]);

// Registry of live editable DOM nodes, keyed by block id. Inline content is
// DOM-as-truth (like the legacy editor); we read it back at save/serialize.
export type DomRegistry = Map<string, HTMLElement>;

// Read the current DOM content for a block if it is an editable text/code block.
export function readBlockContent(
  registry: DomRegistry,
  b: Block,
): Partial<Block> {
  const el = registry.get(b.id);
  if (!el) return {};
  if (b.type === "code") return { text: el.innerText.replace(/\n$/, "") };
  if (isTextType(b.type)) {
    const html = sanitizeHtml(el.innerHTML);
    const empty =
      el.textContent?.trim() === "" && !/<(img|table|br)/i.test(html);
    return { html: empty ? "" : html };
  }
  if (b.type === "table") return { html: sanitizeHtml(el.innerHTML) };
  return {};
}

// Serialize a whole block tree, pulling live inline content out of the DOM.
export function serializeTree(
  registry: DomRegistry,
  blocks: Block[],
): Block[] {
  return blocks.map((b) => {
    if (b.type === "columns") {
      return {
        ...b,
        cols: (b.cols || []).map((col) => serializeTree(registry, col)),
      };
    }
    const content = readBlockContent(registry, b);
    return { ...b, ...content };
  });
}

/* ---- immutable array ops -------------------------------------------- */
export function replaceAt(blocks: Block[], index: number, b: Block): Block[] {
  const next = blocks.slice();
  next[index] = b;
  return next;
}

export function insertAt(blocks: Block[], index: number, ...items: Block[]): Block[] {
  const next = blocks.slice();
  next.splice(index, 0, ...items);
  return next;
}

export function removeAt(blocks: Block[], index: number): Block[] {
  const next = blocks.slice();
  next.splice(index, 1);
  return next;
}

export function moveItem(blocks: Block[], from: number, to: number): Block[] {
  const next = blocks.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Deep-clone a block with fresh ids (for duplicate).
export function cloneBlock(b: Block): Block {
  const copy: Block = { ...b, id: randomId() };
  if (b.type === "columns" && Array.isArray(b.cols)) {
    copy.cols = b.cols.map((col) => col.map(cloneBlock));
  }
  return copy;
}

// Ensure a trailing empty paragraph so there's always a place to type.
export function withTrailingParagraph(blocks: Block[]): Block[] {
  const last = blocks[blocks.length - 1];
  if (!last || !isTextType(last.type)) {
    return [...blocks, newBlock("paragraph")];
  }
  return blocks;
}

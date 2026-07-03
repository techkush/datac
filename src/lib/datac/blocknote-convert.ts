// Conversion between the legacy datac block format (inline HTML,
// `html`/`cols`/`tex`/top-level `pageId` fields) and BlockNote's document
// JSON (props/content/children). Legacy docs are converted once when opened;
// everything is stored in BlockNote format afterwards.

import type { Block } from "./types";

/* ---- format detection --------------------------------------------------
 * BlockNote blocks always carry `props`/`content`/`children`; legacy blocks
 * never do (they use `html`, `cols`, `tex`, top-level `pageId`, …). */
export function isBlockNoteBlock(b: Block | undefined): boolean {
  if (!b) return false;
  return (
    typeof b.props === "object" ||
    Array.isArray((b as { content?: unknown }).content) ||
    Array.isArray((b as { children?: unknown }).children)
  );
}

export function isBlockNoteDoc(blocks: Block[] | undefined): boolean {
  if (!blocks || !blocks.length) return false;
  return blocks.some(isBlockNoteBlock);
}

/* ---- inline HTML → BlockNote InlineContent ----------------------------- */

interface TextStyles {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  textColor?: string;
  backgroundColor?: string;
}

type Inline =
  | { type: "text"; text: string; styles: TextStyles }
  | { type: "link"; href: string; content: Inline[] };

// Legacy color tokens → BlockNote color names (teal has no BlockNote slot).
const COLOR_MAP: Record<string, string> = {
  gray: "gray",
  brown: "brown",
  orange: "orange",
  yellow: "yellow",
  green: "green",
  teal: "green",
  blue: "blue",
  purple: "purple",
  pink: "pink",
  red: "red",
};

function mapColor(token: string | undefined): string | undefined {
  if (!token || token === "default") return undefined;
  return COLOR_MAP[token];
}

function cssColorToken(value: string): string | undefined {
  // Legacy inline styles reference tokens via var(--c-<name>-t/b).
  const m = /var\(--c-([a-z]+)-[tb]\)/.exec(value);
  return m ? COLOR_MAP[m[1]] : undefined;
}

function walkInline(node: Node, styles: TextStyles, out: Inline[]) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (text) out.push({ type: "text", text, styles: { ...styles } });
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (tag === "br") {
    out.push({ type: "text", text: "\n", styles: { ...styles } });
    return;
  }
  const next: TextStyles = { ...styles };
  if (tag === "b" || tag === "strong") next.bold = true;
  else if (tag === "i" || tag === "em") next.italic = true;
  else if (tag === "u") next.underline = true;
  else if (tag === "s" || tag === "strike" || tag === "del") next.strike = true;
  else if (tag === "code") next.code = true;
  else if (tag === "mark") next.backgroundColor = "yellow";
  if (el.style) {
    const tc = el.style.color && cssColorToken(el.style.color);
    const bg =
      (el.style.backgroundColor && cssColorToken(el.style.backgroundColor)) ||
      (el.style.background && cssColorToken(el.style.background));
    if (tc) next.textColor = tc;
    if (bg) next.backgroundColor = bg;
  }
  if (tag === "a") {
    const href = el.getAttribute("href") || "";
    const inner: Inline[] = [];
    el.childNodes.forEach((c) => walkInline(c, next, inner));
    if (href && inner.length) out.push({ type: "link", href, content: inner });
    else out.push(...inner);
    return;
  }
  el.childNodes.forEach((c) => walkInline(c, next, out));
}

export function inlineHtmlToContent(html: string | undefined): Inline[] {
  const s = (html || "").trim();
  if (!s) return [];
  if (typeof window === "undefined" || !("DOMParser" in window)) {
    // Server fallback: strip tags, keep plain text.
    const text = s.replace(/<[^>]+>/g, "");
    return text ? [{ type: "text", text, styles: {} }] : [];
  }
  const doc = new DOMParser().parseFromString(`<div>${s}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const out: Inline[] = [];
  root?.childNodes.forEach((c) => walkInline(c, {}, out));
  return out;
}

/* ---- legacy table HTML → BlockNote table content ------------------------ */

function tableHtmlToContent(html: string | undefined) {
  const rows: Array<{ cells: Array<{ type: "tableCell"; content: Inline[] }> }> =
    [];
  if (typeof window !== "undefined" && html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("tr").forEach((tr) => {
      const cells: Array<{ type: "tableCell"; content: Inline[] }> = [];
      tr.querySelectorAll("td,th").forEach((cell) => {
        cells.push({
          type: "tableCell",
          content: inlineHtmlToContent(cell.innerHTML),
        });
      });
      if (cells.length) rows.push({ cells });
    });
  }
  if (!rows.length)
    rows.push({ cells: [{ type: "tableCell", content: [] }] });
  return { type: "tableContent" as const, rows };
}

/* ---- legacy blocks → BlockNote PartialBlocks --------------------------- */

// Loose partial-block shape; BlockNote fills defaults for missing props.
export interface BnBlock {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: BnBlock[];
}

function colorProps(b: Block): Record<string, unknown> {
  const props = (b.props || {}) as { tc?: string; bg?: string };
  const out: Record<string, unknown> = {};
  const tc = mapColor(props.tc);
  const bg = mapColor(props.bg);
  if (tc) out.textColor = tc;
  if (bg) out.backgroundColor = bg;
  return out;
}

const HEADING_LEVEL: Record<string, number> = { h1: 1, h2: 2, h3: 3, h4: 4 };

function convertBlock(b: Block): BnBlock | null {
  const base = { id: b.id };
  const html = b.html as string | undefined;
  switch (b.type) {
    case "paragraph":
      return {
        ...base,
        type: "paragraph",
        props: colorProps(b),
        content: inlineHtmlToContent(html),
      };
    case "h1":
    case "h2":
    case "h3":
    case "h4":
      return {
        ...base,
        type: "heading",
        props: { level: HEADING_LEVEL[b.type], ...colorProps(b) },
        content: inlineHtmlToContent(html),
      };
    case "bulleted":
      return {
        ...base,
        type: "bulletListItem",
        props: colorProps(b),
        content: inlineHtmlToContent(html),
      };
    case "numbered":
      return {
        ...base,
        type: "numberedListItem",
        props: colorProps(b),
        content: inlineHtmlToContent(html),
      };
    case "todo":
      return {
        ...base,
        type: "checkListItem",
        props: {
          checked: !!(b.props as { checked?: boolean } | undefined)?.checked,
          ...colorProps(b),
        },
        content: inlineHtmlToContent(html),
      };
    case "quote":
      return {
        ...base,
        type: "quote",
        props: colorProps(b),
        content: inlineHtmlToContent(html),
      };
    case "code": {
      const text = (b.text as string) || "";
      return {
        ...base,
        type: "codeBlock",
        props: { language: (b.lang as string) || "text" },
        content: text ? [{ type: "text", text, styles: {} }] : [],
      };
    }
    case "divider":
      return { ...base, type: "divider" };
    case "image":
      return {
        ...base,
        type: "image",
        props: {
          url: (b.url as string) || (b.src as string) || "",
          caption: (b.alt as string) || (b.caption as string) || "",
        },
      };
    case "math":
      return {
        ...base,
        type: "math",
        props: { tex: (b.tex as string) || (b.latex as string) || "" },
      };
    case "page":
      if (!b.pageId) return null;
      return {
        ...base,
        type: "page",
        props: {
          pageId: b.pageId as string,
          link: !!b.link,
          note: (b.note as string) || "",
        },
      };
    case "file":
      return {
        ...base,
        type: "file",
        props: {
          url: (b.url as string) || "",
          name: (b.name as string) || "file",
          caption: (b.note as string) || "",
        },
      };
    case "linkfile":
      return {
        ...base,
        type: "linkfile",
        props: {
          path: (b.path as string) || "",
          name: (b.name as string) || "",
          note: (b.note as string) || "",
        },
      };
    case "table":
      return { ...base, type: "table", content: tableHtmlToContent(html) };
    case "columns": {
      const cols = Array.isArray(b.cols) ? (b.cols as Block[][]) : [];
      const children = cols.map((col) => ({
        type: "column",
        children: legacyToBlockNote(col),
      }));
      if (!children.length) return null;
      return { ...base, type: "columnList", children };
    }
    default:
      // Unknown legacy type: keep the text if any, as a paragraph.
      return {
        ...base,
        type: "paragraph",
        content: inlineHtmlToContent(html),
      };
  }
}

export function legacyToBlockNote(blocks: Block[] | undefined): BnBlock[] {
  const out: BnBlock[] = [];
  for (const b of blocks || []) {
    const converted = convertBlock(b);
    if (converted) out.push(converted);
  }
  if (!out.length) out.push({ type: "paragraph", content: [] });
  return out;
}

/* ---- BlockNote blocks → markdown (for export) --------------------------- */

function inlineToMd(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  let out = "";
  for (const c of content as Inline[]) {
    if (c.type === "link") {
      out += `[${inlineToMd(c.content)}](${c.href})`;
      continue;
    }
    if (c.type !== "text") continue;
    let t = c.text;
    const s = c.styles || {};
    if (s.code) t = "`" + t + "`";
    if (s.bold) t = `**${t}**`;
    if (s.italic) t = `*${t}*`;
    if (s.strike) t = `~~${t}~~`;
    out += t;
  }
  return out;
}

export function blockNoteToMd(b: BnBlock, indent = ""): string {
  const props = (b.props || {}) as Record<string, unknown>;
  const kids = (b.children || [])
    .map((c) => blockNoteToMd(c, indent + "  "))
    .filter(Boolean)
    .join("\n");
  const withKids = (line: string) => (kids ? `${line}\n${kids}` : line);
  switch (b.type) {
    case "heading":
      return withKids(
        `${indent}${"#".repeat(Number(props.level) || 1)} ${inlineToMd(b.content)}`,
      );
    case "bulletListItem":
    case "toggleListItem":
      return withKids(`${indent}- ${inlineToMd(b.content)}`);
    case "numberedListItem":
      return withKids(`${indent}1. ${inlineToMd(b.content)}`);
    case "checkListItem":
      return withKids(
        `${indent}- [${props.checked ? "x" : " "}] ${inlineToMd(b.content)}`,
      );
    case "quote":
      return withKids(`${indent}> ${inlineToMd(b.content)}`);
    case "codeBlock":
      return `${indent}\`\`\`${props.language || ""}\n${inlineToMd(b.content)}\n${indent}\`\`\``;
    case "divider":
      return `${indent}---`;
    case "image":
      return `${indent}![${props.caption || ""}](${props.url || ""})`;
    case "video":
    case "audio":
    case "file":
      return `${indent}[${props.name || props.caption || "file"}](${props.url || ""})`;
    case "linkfile":
      return `${indent}[${props.name || "file"}](${props.path || ""})`;
    case "math":
      return `${indent}$$\n${props.tex || ""}\n$$`;
    case "table": {
      const rows =
        (b.content as { rows?: Array<{ cells: unknown[] }> } | undefined)
          ?.rows || [];
      const lines = rows.map(
        (r) =>
          "| " +
          r.cells
            .map((cell) =>
              inlineToMd(
                (cell as { content?: unknown })?.content ?? cell,
              ).replace(/\|/g, "\\|"),
            )
            .join(" | ") +
          " |",
      );
      if (lines.length > 1)
        lines.splice(
          1,
          0,
          "|" + " --- |".repeat(rows[0]?.cells.length || 1),
        );
      return lines.join("\n");
    }
    case "columnList":
      return kids;
    case "column":
      return kids;
    case "page":
      return ""; // handled by the export recursion
    default:
      return withKids(`${indent}${inlineToMd(b.content)}`);
  }
}

/* ---- shared walkers ------------------------------------------------------
 * Collect child page ids from a BlockNote document (page blocks that are
 * owned sub-pages, i.e. not `link`), in document order. Mirrors the legacy
 * collectPageIds walk. */
export function collectBnPageIds(blocks: BnBlock[] | undefined, out: string[]) {
  for (const b of blocks || []) {
    if (b.type === "page") {
      const p = (b.props || {}) as { pageId?: string };
      if (p.pageId) out.push(p.pageId);
    }
    if (Array.isArray(b.children)) collectBnPageIds(b.children, out);
    // Table content never nests pages; columns are covered via children.
  }
}

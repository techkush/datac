// Inline markdown <-> HTML + block <-> markdown, ported from the legacy
// inline.js / serialize.js. Runs client-side (sanitizeHtml uses the DOM).
import type { Block } from "./types";
import { randomId } from "./constants";

interface ParsedDesc {
  type: string;
  md?: string;
  text?: string;
  bid?: string | null;
  checked?: boolean;
  n?: number;
  cols?: string[];
  html?: string;
  url?: string;
  alt?: string;
  name?: string;
  size?: string;
}

function extractBid(s: string): { md: string; bid: string | null } {
  const m = (s || "").match(/\s*<!--c:([a-z0-9]+)-->\s*$/i);
  if (!m) return { md: s, bid: null };
  return { md: s.slice(0, m.index), bid: m[1] };
}

export function parseMarkdown(md: string): ParsedDesc[] {
  const blocks: ParsedDesc[] = [];
  const raw = (md || "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const noZwsp = line.replace(/​/g, "").replace(/\\u200B/g, "");
    if (line !== noZwsp && noZwsp.trim() === "") {
      blocks.push({ type: "paragraph", md: "" });
      continue;
    }
    if (line.trim() === "") continue;

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      i++;
      while (i < raw.length && !raw[i].trim().startsWith("```")) {
        code.push(raw[i]);
        i++;
      }
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (line.trim().startsWith("<!--columns")) {
      const cm = line.match(/<!--columns:(\d+)/);
      const n = cm ? Math.max(2, Math.min(5, +cm[1])) : 2;
      const cols: string[][] = [];
      let cur: string[] | null = null;
      let depth = 1;
      i++;
      while (i < raw.length) {
        const ln = raw[i];
        const t = ln.trim();
        if (t.startsWith("<!--columns")) {
          depth++;
          if (cur) cur.push(ln);
        } else if (t === "<!--/columns-->") {
          if (depth === 1) break;
          depth--;
          if (cur) cur.push(ln);
        } else if (t === "<!--col-->" && depth === 1) {
          cur = [];
          cols.push(cur);
        } else if (cur) cur.push(ln);
        i++;
      }
      blocks.push({ type: "columns", n, cols: cols.map((c) => c.join("\n")) });
      continue;
    }
    if (line.trim() === "<!--table-->") {
      const html: string[] = [];
      i++;
      while (i < raw.length && raw[i].trim() !== "<!--/table-->") {
        html.push(raw[i]);
        i++;
      }
      blocks.push({ type: "table", html: html.join("\n") });
      continue;
    }
    if (/^<!--\/?(?:columns(?::\d+)?|col)-->$/.test(line.trim())) continue;
    {
      const dm = line.match(
        /^\s*(?:---|\*\*\*)\s*(?:<!--c:([a-z0-9]+)-->)?\s*$/,
      );
      if (dm) {
        blocks.push({ type: "divider", bid: dm[1] || null });
        continue;
      }
    }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      const { md: mm, bid } = extractBid(m[2]);
      blocks.push({ type: "h" + m[1].length, md: mm, bid });
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))) {
      const { md: mm, bid } = extractBid(m[2]);
      blocks.push({
        type: "todo",
        md: mm,
        bid,
        checked: m[1].toLowerCase() === "x",
      });
      continue;
    }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      const im = m[1].match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (im) {
        blocks.push({ type: "image", alt: im[1], url: im[2] });
        continue;
      }
      const { md: mm, bid } = extractBid(m[1]);
      blocks.push({ type: "bulleted", md: mm, bid });
      continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) {
      const { md: mm, bid } = extractBid(m[1]);
      blocks.push({ type: "numbered", md: mm, bid });
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      const { md: mm, bid } = extractBid(m[1]);
      blocks.push({ type: "quote", md: mm, bid });
      continue;
    }
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) {
      blocks.push({ type: "image", alt: m[1], url: m[2] });
      continue;
    }
    if (
      (m = line.match(
        /^\[📎\s*([^\]]*)\]\(([^)]+)\)(?:\s*<!--size:(\d+)-->)?\s*$/,
      ))
    ) {
      blocks.push({ type: "file", name: m[1], url: m[2], size: m[3] });
      continue;
    }
    const { md: mm, bid } = extractBid(line);
    blocks.push({ type: "paragraph", md: mm, bid });
  }
  return blocks;
}

// Convert parsed descriptors directly into canonical JSON blocks.
export function descToBlocks(
  parsed: ParsedDesc[],
  styles: Record<string, { tc?: string; bg?: string }> = {},
): Block[] {
  return parsed.map((b): Block => {
    const id = b.bid || randomId();
    const st = b.bid ? styles[b.bid] : undefined;
    const props: Record<string, unknown> = {};
    if (b.checked) props.checked = true;
    if (st?.tc) props.tc = st.tc;
    if (st?.bg) props.bg = st.bg;
    const base: Block = { id, type: b.type as Block["type"] };
    if (Object.keys(props).length) base.props = props;
    switch (b.type) {
      case "divider":
        return base;
      case "image":
        return { ...base, url: b.url || "", alt: b.alt || "" };
      case "file":
        return {
          ...base,
          url: b.url || "",
          name: b.name || "file",
          ...(b.size ? { size: +b.size } : {}),
        };
      case "table":
        return { ...base, html: sanitizeHtml(b.html || "") };
      case "code":
        return { ...base, text: b.text || "" };
      case "columns":
        return {
          ...base,
          cols: (b.cols || []).map((c) => descToBlocks(parseMarkdown(c), styles)),
        };
      default:
        return { ...base, html: renderInline(b.md || "") };
    }
  });
}

export function parseMarkdownToBlocks(
  md: string,
  styles: Record<string, { tc?: string; bg?: string }> = {},
): Block[] {
  return descToBlocks(parseMarkdown(md), styles);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function inlineMdToHtml(md: string): string {
  let s = escapeHtml(md);
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return "" + (codes.length - 1) + "";
  });
  s = s.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`,
  );
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/__([^_]+)__/g, "<u>$1</u>");
  s = s.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  s = s.replace(/(\d+)/g, (_, i) => `<code>${codes[+i]}</code>`);
  return s;
}

export function inlineHtmlToMd(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) {
      out += n.textContent;
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = inlineHtmlToMd(el);
    switch (tag) {
      case "strong":
      case "b":
        out += `**${inner}**`;
        break;
      case "em":
      case "i":
        out += `*${inner}*`;
        break;
      case "u":
        out += `__${inner}__`;
        break;
      case "s":
      case "strike":
      case "del":
        out += `~~${inner}~~`;
        break;
      case "code":
        out += `\`${el.textContent}\``;
        break;
      case "a":
        out += `[${inner}](${el.getAttribute("href") || ""})`;
        break;
      case "br":
        out += "\n";
        break;
      default:
        out += inner;
    }
  });
  return out;
}

const ALLOWED_TAGS = new Set([
  "span", "mark", "sub", "sup", "b", "strong", "i", "em", "u", "s",
  "strike", "del", "code", "a", "br", "table", "thead", "tbody", "tfoot",
  "tr", "td", "th",
]);
const ALLOWED_TAG_RE =
  /<\/?(?:span|mark|sub|sup|strong|b|em|i|u|s|strike|del|code|a|br|table|tr|td|th|thead|tbody)(?:\s[^>]*)?>/i;

function cleanStyle(value: string): string {
  const keep: string[] = [];
  String(value)
    .split(";")
    .forEach((d) => {
      const idx = d.indexOf(":");
      if (idx < 0) return;
      const k = d.slice(0, idx).trim().toLowerCase();
      const v = d.slice(idx + 1).trim();
      if (!v) return;
      if (
        k === "color" ||
        k === "background-color" ||
        k === "background" ||
        k === "font-weight" ||
        k === "text-decoration" ||
        k === "text-align"
      )
        keep.push(k + ":" + v);
    });
  return keep.join(";");
}

export function sanitizeHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  Array.from(tmp.querySelectorAll("*")).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      el.replaceWith(...Array.from(el.childNodes));
      return;
    }
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name === "colspan" || name === "rowspan") return;
      if (tag === "a" && name === "href") {
        if (/^\s*javascript:/i.test(attr.value)) el.removeAttribute("href");
        return;
      }
      if (name === "style") {
        const s = cleanStyle(attr.value);
        if (s) el.setAttribute("style", s);
        else el.removeAttribute("style");
        return;
      }
      el.removeAttribute(attr.name);
    });
    if (tag === "a") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener");
    }
  });
  return tmp.innerHTML;
}

function elementHasRich(el: HTMLElement): boolean {
  return !!(el.querySelector && el.querySelector("span,mark,sub,sup,font,table,[style]"));
}

export function richInline(el: HTMLElement): string {
  return elementHasRich(el)
    ? sanitizeHtml(el.innerHTML).replace(/\s+/g, " ").trim()
    : inlineHtmlToMd(el);
}

export function renderInline(md: string): string {
  return ALLOWED_TAG_RE.test(md || "")
    ? sanitizeHtml(md)
    : inlineMdToHtml(md || "");
}

/* ---- markdown export (JSON block -> markdown) -------------------------- */
export function htmlToMd(html: string): string {
  if (typeof document === "undefined") return html || "";
  const t = document.createElement("div");
  t.innerHTML = html || "";
  return inlineHtmlToMd(t);
}

export function blockJsonToMd(b: Block): string {
  const props = (b.props as { checked?: boolean }) || {};
  switch (b.type) {
    case "h1": return "# " + htmlToMd(b.html || "");
    case "h2": return "## " + htmlToMd(b.html || "");
    case "h3": return "### " + htmlToMd(b.html || "");
    case "h4": return "#### " + htmlToMd(b.html || "");
    case "bulleted": return "- " + htmlToMd(b.html || "");
    case "numbered": return "1. " + htmlToMd(b.html || "");
    case "todo": return `- [${props.checked ? "x" : " "}] ` + htmlToMd(b.html || "");
    case "quote": return "> " + htmlToMd(b.html || "");
    case "code": return "```\n" + ((b.text as string) || "") + "\n```";
    case "math": return "$$\n" + ((b.tex as string) || "") + "\n$$";
    case "divider": return "---";
    case "image": return `![${(b.alt as string) || ""}](${(b.url as string) || ""})`;
    case "file":
      return `[📎 ${b.name || "file"}](${(b.url as string) || ""})${
        b.note ? "\n> " + String(b.note).replace(/\n/g, " ") : ""
      }`;
    case "linkfile":
      return `[🔗 ${b.name || "file"}](file://${(b.path as string) || ""})${
        b.note ? "\n> " + String(b.note).replace(/\n/g, " ") : ""
      }`;
    case "table": return (b.html as string) || "";
    case "columns":
      return (((b.cols as Block[][]) || []) as Block[][])
        .map((col) => (col || []).map(blockJsonToMd).join("\n\n"))
        .join("\n\n");
    default:
      return htmlToMd(b.html || "");
  }
}

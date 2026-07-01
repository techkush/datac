/* ------------------------------------------------------------------ *
 *  Inline markdown <-> HTML
 * ------------------------------------------------------------------ */
function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineMdToHtml(md) {
  let s = escapeHtml(md);
  const codes = [];
  // protect inline code spans with a private-use sentinel so emphasis rules skip them
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\uF8FF' + (codes.length - 1) + '\uF8FF'; });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/__([^_]+)__/g, '<u>$1</u>');
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/\uF8FF(\d+)\uF8FF/g, (_, i) => `<code>${codes[i]}</code>`);
  return s;
}

function inlineHtmlToMd(node) {
  let out = '';
  node.childNodes.forEach((n) => {
    if (n.nodeType === 3) { out += n.textContent; return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName.toLowerCase();
    const inner = inlineHtmlToMd(n);
    switch (tag) {
      case 'strong': case 'b': out += `**${inner}**`; break;
      case 'em': case 'i': out += `*${inner}*`; break;
      case 'u': out += `__${inner}__`; break;
      case 's': case 'strike': case 'del': out += `~~${inner}~~`; break;
      case 'code': out += `\`${n.textContent}\``; break;
      case 'a': out += `[${inner}](${n.getAttribute('href') || ''})`; break;
      case 'br': out += '\n'; break;
      default: out += inner;
    }
  });
  return out;
}

/* ------------------------------------------------------------------ *
 *  Rich HTML preservation (colours, spans, sub/sup, tables…)
 * ------------------------------------------------------------------ */
const ALLOWED_TAGS = new Set(['span', 'mark', 'sub', 'sup', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'code', 'a', 'br',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th']);
// detect content that is stored as (allowed) HTML rather than plain markdown
const ALLOWED_TAG_RE = /<\/?(?:span|mark|sub|sup|strong|b|em|i|u|s|strike|del|code|a|br|table|tr|td|th|thead|tbody)(?:\s[^>]*)?>/i;

function cleanStyle(value) {
  const keep = [];
  String(value).split(';').forEach((d) => {
    const idx = d.indexOf(':'); if (idx < 0) return;
    const k = d.slice(0, idx).trim().toLowerCase();
    const v = d.slice(idx + 1).trim();
    if (!v) return;
    if (k === 'color' || k === 'background-color' || k === 'background' || k === 'font-weight' || k === 'text-decoration' || k === 'text-align') keep.push(k + ':' + v);
  });
  return keep.join(';');
}
function sanitizeHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  Array.from(tmp.querySelectorAll('*')).forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) { el.replaceWith(...el.childNodes); return; }
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name === 'colspan' || name === 'rowspan') return;
      if (tag === 'a' && name === 'href') { if (/^\s*javascript:/i.test(attr.value)) el.removeAttribute('href'); return; }
      if (name === 'style') { const s = cleanStyle(attr.value); if (s) el.setAttribute('style', s); else el.removeAttribute('style'); return; }
      el.removeAttribute(attr.name);
    });
    if (tag === 'a') { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
  });
  return tmp.innerHTML;
}
// does an element hold formatting that markdown can't express (so we must keep HTML)?
function elementHasRich(el) {
  if (el.querySelector && el.querySelector('span,mark,sub,sup,font,table,[style]')) return true;
  return false;
}
// serialize a block body to markdown, or to sanitized HTML when it has rich formatting
function richInline(el) {
  return elementHasRich(el) ? sanitizeHtml(el.innerHTML).replace(/\s+/g, ' ').trim() : inlineHtmlToMd(el);
}
// render stored inline content (HTML passthrough if it contains allowed tags, else markdown)
function renderInline(md) {
  return ALLOWED_TAG_RE.test(md || '') ? sanitizeHtml(md) : inlineMdToHtml(md || '');
}

/* ------------------------------------------------------------------ *
 *  Markdown serialization
 * ------------------------------------------------------------------ */
function serialize() { return serializeBlocks(editor).join('\n').replace(/\n+$/, '\n'); }

function serializeBlocks(container) {
  const lines = [];
  Array.from(container.children).forEach((block) => {
    if (!block.classList || !block.classList.contains('block')) return;
    const type = block.dataset.type;
    const body = $(':scope > .block-body', block);
    const tag = block.dataset.bid ? ` <!--c:${block.dataset.bid}-->` : '';
    switch (type) {
      case 'h1': lines.push('# ' + richInline(body) + tag); break;
      case 'h2': lines.push('## ' + richInline(body) + tag); break;
      case 'h3': lines.push('### ' + richInline(body) + tag); break;
      case 'h4': lines.push('#### ' + richInline(body) + tag); break;
      case 'bulleted': lines.push('- ' + richInline(body) + tag); break;
      case 'numbered': lines.push('1. ' + richInline(body) + tag); break;
      case 'todo': lines.push(`- [${block.classList.contains('checked') ? 'x' : ' '}] ` + richInline(body) + tag); break;
      case 'quote': lines.push('> ' + richInline(body) + tag); break;
      case 'code': lines.push('```\n' + body.innerText.replace(/\n$/, '') + '\n```'); break;
      case 'divider': lines.push('---' + (block.dataset.bid ? ` <!--c:${block.dataset.bid}-->` : '')); break;
      case 'table': {
        lines.push('<!--table-->');
        sanitizeHtml(body.innerHTML).split('\n').forEach((l) => lines.push(l));
        lines.push('<!--/table-->');
        break;
      }
      case 'columns': {
        const cols = $$(':scope > .cols-wrap > .col', block);
        lines.push(`<!--columns:${cols.length}-->`);
        cols.forEach((col) => { lines.push('<!--col-->'); serializeBlocks(col).forEach((l) => lines.push(l)); });
        lines.push('<!--/columns-->');
        break;
      }
      case 'image': lines.push(`![${block.dataset.alt || ''}](${block.dataset.url})`); break;
      case 'file': lines.push(`[📎 ${block.dataset.name || 'file'}](${block.dataset.url})${block.dataset.size ? ` <!--size:${block.dataset.size}-->` : ''}`); { const nt = noteOf(block); if (nt) lines.push('> ' + nt.replace(/\n/g, ' ')); } break;
      case 'linkfile': lines.push(`[🔗 ${block.dataset.name || 'file'}](file://${block.dataset.path || ''})`); { const nt = noteOf(block); if (nt) lines.push('> ' + nt.replace(/\n/g, ' ')); } break;
      case 'page': { const c = state.docs.find((d) => d.id === block.dataset.pageId); lines.push(`[📄 ${(c && c.title) || 'Untitled'}](./${block.dataset.pageId}.json)`); break; }
      default: {
        const md = richInline(body);
        // an empty paragraph would serialize to a blank line and be lost on reload;
        // mark it with a zero-width space so the line break is preserved.
        lines.push((md === '' && !tag ? '\u200B' : md) + tag);
      }
    }
    lines.push('');
  });
  return lines;
}

// pull a trailing comment-anchor marker off a markdown fragment
function extractBid(s) {
  const m = (s || '').match(/\s*<!--c:([a-z0-9]+)-->\s*$/i);
  if (!m) return { md: s, bid: null };
  return { md: s.slice(0, m.index), bid: m[1] };
}

function parseMarkdown(md) {
  const blocks = [];
  const raw = (md || '').replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    // a zero-width-space line is a preserved empty paragraph (intentional line break)
    const _noZwsp = line.replace(/\u200B/g, "").replace(/\\u200B/g, "");
    if (line !== _noZwsp && _noZwsp.trim() === "") { blocks.push({ type: "paragraph", md: "" }); continue; }
    if (line.trim() === '') continue;

    // fenced code
    if (line.trim().startsWith('```')) {
      const code = [];
      i++;
      while (i < raw.length && !raw[i].trim().startsWith('```')) { code.push(raw[i]); i++; }
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    // column layout — depth-aware so columns can be nested inside columns
    if (line.trim().startsWith('<!--columns')) {
      const cm = line.match(/<!--columns:(\d+)/);
      const n = cm ? Math.max(2, Math.min(5, +cm[1])) : 2;
      const cols = []; let cur = null; let depth = 1;
      i++;
      while (i < raw.length) {
        const ln = raw[i];
        const t = ln.trim();
        if (t.startsWith('<!--columns')) { depth++; if (cur) cur.push(ln); }
        else if (t === '<!--/columns-->') { if (depth === 1) break; depth--; if (cur) cur.push(ln); }
        else if (t === '<!--col-->' && depth === 1) { cur = []; cols.push(cur); }
        else if (cur) cur.push(ln);
        i++;
      }
      blocks.push({ type: 'columns', n, cols: cols.map((c) => c.join('\n')) });
      continue;
    }
    // table block (stored as sanitized HTML between markers)
    if (line.trim() === '<!--table-->') {
      const html = [];
      i++;
      while (i < raw.length && raw[i].trim() !== '<!--/table-->') { html.push(raw[i]); i++; }
      blocks.push({ type: 'table', html: html.join('\n') });
      continue;
    }
    // heal stray column markers left by older corrupted saves
    if (/^<!--\/?(?:columns(?::\d+)?|col)-->$/.test(line.trim())) continue;
    { const dm = line.match(/^\s*(?:---|\*\*\*)\s*(?:<!--c:([a-z0-9]+)-->)?\s*$/); if (dm) { blocks.push({ type: 'divider', bid: dm[1] || null }); continue; } }

    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { const { md, bid } = extractBid(m[2]); blocks.push({ type: 'h' + m[1].length, md, bid }); continue; }
    if ((m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))) { const { md, bid } = extractBid(m[2]); blocks.push({ type: 'todo', md, bid, checked: m[1].toLowerCase() === 'x' }); continue; }
    if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      const im = m[1].match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
      if (im) { blocks.push({ type: 'image', alt: im[1], url: im[2] }); continue; }
      const { md, bid } = extractBid(m[1]);
      blocks.push({ type: 'bulleted', md, bid }); continue;
    }
    if ((m = line.match(/^\s*\d+\.\s+(.*)$/))) { const { md, bid } = extractBid(m[1]); blocks.push({ type: 'numbered', md, bid }); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { const { md, bid } = extractBid(m[1]); blocks.push({ type: 'quote', md, bid }); continue; }
    // standalone image
    if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/))) { blocks.push({ type: 'image', alt: m[1], url: m[2] }); continue; }
    // standalone file link
    if ((m = line.match(/^\[📎\s*([^\]]*)\]\(([^)]+)\)(?:\s*<!--size:(\d+)-->)?\s*$/))) {
      blocks.push({ type: 'file', name: m[1], url: m[2], size: m[3] }); continue;
    }
    { const { md, bid } = extractBid(line); blocks.push({ type: 'paragraph', md, bid }); }
  }
  return blocks;
}

// build one block element from a parsed descriptor (recurses for columns)
function buildBlock(b) {
  let el;
  if (b.type === 'divider') el = makeDivider();
  else if (b.type === 'columns') el = makeColumns(b.n, b.cols);
  else if (b.type === 'image') el = makeImage(b.url, b.alt);
  else if (b.type === 'file') el = makeFile(b.url, b.name, b.size);
  else if (b.type === 'table') el = makeTable(b.html);
  else {
    el = newBlockEl(b.type);
    const body = $('.block-body', el);
    if (b.type === 'code') body.innerText = b.text || '';
    else body.innerHTML = renderInline(b.md || '');
    if (b.type === 'todo' && b.checked) el.classList.add('checked');
  }
  // anchor id (comments on dividers, colour styles on text blocks)
  if (b.bid) {
    el.dataset.bid = b.bid;
    const st = state.styles[b.bid];
    if (st) { if (st.tc) el.dataset.tc = st.tc; if (st.bg) el.dataset.bg = st.bg; }
  }
  return el;
}

function renderBlocks(parsed) {
  editor.innerHTML = '';
  if (!parsed.length) { editor.appendChild(newBlockEl('paragraph')); refresh(); return; }
  parsed.forEach((b) => editor.appendChild(buildBlock(b)));
  // sync todo checkboxes (incl. nested)
  $$('.block[data-type="todo"]', editor).forEach((b) => {
    const cb = $('.todo-check', b); if (cb) cb.checked = b.classList.contains('checked');
  });
  ensureTrailingParagraph();
  refreshCommentBadges();
  refresh();
}

// reflect comment counts onto blocks
function refreshCommentBadges() {
  $$('.block[data-bid]', editor).forEach((block) => {
    const list = state.comments[block.dataset.bid] || [];
    block.classList.toggle('has-comment', list.length > 0);
    const c = $('.block-comment .cc-count', block);
    if (c) c.textContent = list.length ? String(list.length) : '';
  });
}

/* ================================================================== *
 *  JSON document model (canonical storage)
 *  DOM is the live representation; we read it to JSON to save and
 *  build it from JSON to load. Inline content is sanitized HTML.
 * ================================================================== */
function blocksToJson(container) {
  const arr = [];
  Array.from(container.children).forEach((block) => {
    if (block.classList && block.classList.contains('block')) arr.push(blockToJson(block));
  });
  return arr;
}
function blockToJson(block) {
  const type = block.dataset.type;
  const body = $(':scope > .block-body', block);
  const id = block.dataset.bid || (block.dataset.bid = randomId());
  const b = { id, type };
  const props = {};
  if (block.classList.contains('checked')) props.checked = true;
  if (block.dataset.tc) props.tc = block.dataset.tc;
  if (block.dataset.bg) props.bg = block.dataset.bg;
  if (Object.keys(props).length) b.props = props;
  switch (type) {
    case 'divider': break;
    case 'image': b.url = block.dataset.url || ''; b.alt = block.dataset.alt || ''; break;
    case 'file': b.url = block.dataset.url || ''; b.name = block.dataset.name || 'file'; if (block.dataset.size) b.size = +block.dataset.size; b.note = noteOf(block); break;
    case 'linkfile': b.path = block.dataset.path || ''; b.name = block.dataset.name || 'file'; b.note = noteOf(block); break;
    case 'page': b.pageId = block.dataset.pageId || ''; b.note = noteOf(block); if (block.dataset.link === '1') b.link = true; break;
    case 'code': b.text = body ? body.innerText.replace(/\n$/, '') : ''; break;
    case 'table': b.html = body ? sanitizeHtml(body.innerHTML) : ''; break;
    case 'columns': b.cols = $$(':scope > .cols-wrap > .col', block).map((col) => blocksToJson(col)); break;
    default: {
      const html = body ? sanitizeHtml(body.innerHTML) : '';
      b.html = (body && body.textContent.trim() === '' && !/<(img|table|br)/i.test(html)) ? '' : html;
    }
  }
  return b;
}
function docToJson() {
  pruneComments();
  return {
    title: titleInput.value.trim() || 'Untitled',
    icon: state.icon || '', cover: state.cover || '', parent: state.parent || '', status: state.status || '',
    blocks: blocksToJson(editor),
    comments: state.comments || {},
  };
}

function buildBlockJson(b) {
  let el;
  if (b.type === 'divider') el = makeDivider();
  else if (b.type === 'columns') el = makeColumnsJson(b.cols || []);
  else if (b.type === 'image') el = makeImage(b.url, b.alt);
  else if (b.type === 'file') el = makeFile(b.url, b.name, b.size, b.note);
  else if (b.type === 'linkfile') el = makeLinkFile(b.path, b.name, b.note);
  else if (b.type === 'page') el = makePage(b.pageId, b.note, b.link);
  else if (b.type === 'table') el = makeTable(b.html);
  else {
    el = newBlockEl(b.type);
    const body = $('.block-body', el);
    if (b.type === 'code') body.innerText = b.text || '';
    else body.innerHTML = sanitizeHtml(b.html || '');
    if (b.props && b.props.checked) el.classList.add('checked');
  }
  if (b.id) el.dataset.bid = b.id;
  if (b.props) { if (b.props.tc) el.dataset.tc = b.props.tc; if (b.props.bg) el.dataset.bg = b.props.bg; }
  return el;
}
function makeColumnsJson(colsArr) {
  const n = Math.max(2, Math.min(5, colsArr.length || 2));
  const block = document.createElement('div');
  block.className = 'block'; block.dataset.type = 'columns'; block.dataset.cols = n;
  const gutter = document.createElement('div'); gutter.className = 'block-gutter';
  gutter.appendChild(makeAddButton(block));
  const handle = document.createElement('div'); handle.className = 'block-handle'; handle.textContent = '⋮⋮';
  handle.setAttribute('draggable', 'true'); handle.title = 'Drag to move';
  gutter.appendChild(handle); block.appendChild(gutter);
  const wrap = document.createElement('div'); wrap.className = 'cols-wrap'; wrap.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  for (let k = 0; k < n; k++) {
    const col = document.createElement('div'); col.className = 'col';
    const sub = colsArr[k] || [];
    if (!sub.length) col.appendChild(newBlockEl('paragraph'));
    else sub.forEach((sb) => col.appendChild(buildBlockJson(sb)));
    wrap.appendChild(col);
  }
  block.appendChild(wrap);
  return block;
}
function renderDocJson(doc) {
  editor.innerHTML = '';
  const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
  if (!blocks.length) { editor.appendChild(newBlockEl('paragraph')); refresh(); return; }
  blocks.forEach((b) => editor.appendChild(buildBlockJson(b)));
  $$('.block[data-type="todo"]', editor).forEach((b) => { const cb = $('.todo-check', b); if (cb) cb.checked = b.classList.contains('checked'); });
  ensureTrailingParagraph();
  refreshCommentBadges();
  refresh();
}

// always keep an empty paragraph at the very end so you can add content
// after a component (image / file / divider / columns / table)
function ensureTrailingParagraph() {
  const last = editor.lastElementChild;
  if (!last || !last.classList.contains('block') || !TEXT_TYPES.has(last.dataset.type)) {
    editor.appendChild(newBlockEl('paragraph'));
  }
}

// Markdown export (uses the existing DOM→markdown serializer)
// inline HTML string -> markdown (uses a scratch element + the DOM converter)
function htmlToMd(html) { const t = document.createElement('div'); t.innerHTML = html || ''; return inlineHtmlToMd(t); }

// convert one JSON block to markdown line(s)
function blockJsonToMd(b) {
  switch (b.type) {
    case 'h1': return '# ' + htmlToMd(b.html);
    case 'h2': return '## ' + htmlToMd(b.html);
    case 'h3': return '### ' + htmlToMd(b.html);
    case 'h4': return '#### ' + htmlToMd(b.html);
    case 'bulleted': return '- ' + htmlToMd(b.html);
    case 'numbered': return '1. ' + htmlToMd(b.html);
    case 'todo': return `- [${b.props && b.props.checked ? 'x' : ' '}] ` + htmlToMd(b.html);
    case 'quote': return '> ' + htmlToMd(b.html);
    case 'code': return '```\n' + (b.text || '') + '\n```';
    case 'divider': return '---';
    case 'image': return `![${b.alt || ''}](${b.url || ''})`;
    case 'file': return `[📎 ${b.name || 'file'}](${b.url || ''})${b.note ? '\n> ' + b.note.replace(/\n/g, ' ') : ''}`;
    case 'linkfile': return `[🔗 ${b.name || 'file'}](file://${b.path || ''})${b.note ? '\n> ' + b.note.replace(/\n/g, ' ') : ''}`;
    case 'table': return b.html || '';
    case 'columns': return (b.cols || []).map((col) => (col || []).map(blockJsonToMd).join('\n\n')).join('\n\n');
    default: return htmlToMd(b.html);
  }
}

// recursively render a page (and its sub-pages) to markdown
async function pageToMarkdown(pageId, level, seen) {
  if (seen.has(pageId)) return '';
  seen.add(pageId);
  let doc;
  try { doc = await api.get(pageId); } catch (_) { return ''; }
  if (!doc || doc.error) return '';
  const h = '#'.repeat(Math.min(level, 6));
  let out = `${h} ${doc.icon ? doc.icon + ' ' : ''}${doc.title || 'Untitled'}\n\n`;
  for (const b of doc.blocks || []) {
    if (b.type === 'page' && b.pageId) { out += await pageToMarkdown(b.pageId, level + 1, seen) + '\n'; }
    else out += blockJsonToMd(b) + '\n\n';
  }
  return out;
}

async function downloadMarkdown() {
  if (state.dirty) await saveNow();
  const md = await pageToMarkdown(state.currentId, 1, new Set());
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (titleInput.value.trim() || 'Untitled').replace(/[^\w-]+/g, '_').slice(0, 60) + '.md';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ------------------------------------------------------------------ *
 *  Refresh: numbering + placeholders
 * ------------------------------------------------------------------ */
function refresh() { numberContainer(editor); }

function numberContainer(container) {
  let num = 0;
  Array.from(container.children).forEach((block) => {
    if (!block.classList || !block.classList.contains('block')) return;
    const type = block.dataset.type;
    if (type === 'columns') { num = 0; $$(':scope > .cols-wrap > .col', block).forEach(numberContainer); return; }
    const body = $(':scope > .block-body', block);
    if (type === 'numbered') { num++; const m = $(':scope > .block-marker', block); if (m) m.dataset.num = num; }
    else num = 0;
    if (TEXT_TYPES.has(type) && body) {
      const empty = body.textContent.trim() === '' && body.children.length === 0;
      body.dataset.empty = empty ? 'true' : 'false';
      body.dataset.placeholder = PLACEHOLDERS[type] || '';
    }
  });
}

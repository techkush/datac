/* ------------------------------------------------------------------ *
 *  Block construction
 * ------------------------------------------------------------------ */
// left-gutter "+" that inserts a new line right after the block
function makeAddButton(block) {
  const add = document.createElement('button');
  add.className = 'block-add';
  add.type = 'button';
  add.contentEditable = 'false';
  add.textContent = '+';
  add.title = 'Add a line below';
  add.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); addLineAfter(block); });
  return add;
}
function addLineAfter(block) {
  const nb = newBlockEl('paragraph');
  block.after(nb);
  refresh();
  placeCaret($('.block-body', nb), false);
  captureHistory(); queueSave();
}

function newBlockEl(type = 'paragraph') {
  const block = document.createElement('div');
  block.className = 'block';
  block.dataset.type = type;

  const gutter = document.createElement('div');
  gutter.className = 'block-gutter';
  gutter.appendChild(makeAddButton(block));
  const handle = document.createElement('div');
  handle.className = 'block-handle';
  handle.textContent = '⋮⋮';
  handle.setAttribute('draggable', 'true');
  handle.title = 'Drag to move';
  gutter.appendChild(handle);
  block.appendChild(gutter);

  const marker = document.createElement('span');
  marker.className = 'block-marker';
  marker.contentEditable = 'false';
  block.appendChild(marker);

  const body = document.createElement('div');
  body.className = 'block-body';
  if (TEXT_TYPES.has(type) || type === 'code') body.contentEditable = 'true';
  block.appendChild(body);

  // right-gutter comment affordance — on dividers (comment the divided section)
  if (type === 'divider') {
    const cbtn = document.createElement('button');
    cbtn.className = 'block-comment';
    cbtn.type = 'button';
    cbtn.contentEditable = 'false';
    cbtn.title = 'Comment on this section';
    cbtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="cc-count"></span>';
    cbtn.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); openCommentPopover(block); });
    block.appendChild(cbtn);
  }

  if (type === 'todo') setupTodo(block);
  return block;
}

function setupTodo(block) {
  let marker = $('.block-marker', block);
  marker.innerHTML = '';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'todo-check';
  cb.checked = block.classList.contains('checked');
  cb.addEventListener('change', () => {
    block.classList.toggle('checked', cb.checked);
    queueSave();
  });
  marker.appendChild(cb);
}

function setBlockType(block, type) {
  const body = $('.block-body', block);
  const wasCode = block.dataset.type === 'code';
  block.dataset.type = type;
  const marker = $('.block-marker', block);
  marker.innerHTML = '';
  block.classList.remove('checked');
  body.contentEditable = (TEXT_TYPES.has(type) || type === 'code') ? 'true' : 'false';
  // converting to/from code flattens formatting to plain text
  if (type === 'code' || wasCode) { const t = body.innerText; body.innerHTML = ''; body.innerText = t; }
  if (type === 'todo') setupTodo(block);
  refresh();
}

/* divider / image / file payload blocks */
function makeDivider() {
  const b = newBlockEl('divider');
  $('.block-body', b).innerHTML = '';
  return b;
}
function makeTable(html) {
  const b = newBlockEl('paragraph');     // reuse the block shell (handle, gutter)
  b.dataset.type = 'table';
  const body = $('.block-body', b);
  body.contentEditable = 'true';
  body.innerHTML = sanitizeHtml(html || '<table><tr><td>Cell</td><td>Cell</td></tr></table>');
  return b;
}
function makeImage(url, alt) {
  const b = newBlockEl('image');
  b.dataset.url = url; b.dataset.alt = alt || '';
  const img = document.createElement('img');
  img.src = url; img.alt = alt || '';
  $('.block-body', b).appendChild(img);
  return b;
}
// shared full-width file card with an optional note under the details
function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
function fileCard(opts) {
  const card = document.createElement('div');
  card.className = 'file-card';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'file-open'; btn.contentEditable = 'false';
  btn.innerHTML = `<span class="file-ico">${opts.icon || '📎'}</span><span class="file-meta"><span class="file-name"></span><small class="file-sub"></small></span><span class="file-go">↗</span>`;
  $('.file-name', btn).textContent = opts.name || 'file';
  $('.file-sub', btn).textContent = opts.sub || '';
  btn.addEventListener('click', (e) => { e.preventDefault(); opts.open && opts.open(); });
  card.appendChild(btn);
  const note = document.createElement('textarea');
  note.className = 'file-note'; note.rows = 1; note.placeholder = 'Add a note…'; note.value = opts.note || '';
  // keep the note's own keys/input from reaching the editor's block logic
  // (otherwise Enter splits a stale block and detaches the card)
  note.addEventListener('keydown', (e) => { e.stopPropagation(); });
  note.addEventListener('input', (e) => { e.stopPropagation(); autoGrow(note); queueSave(); });
  note.addEventListener('paste', (e) => { e.stopPropagation(); });
  card.appendChild(note);
  return card;
}
function noteOf(block) { const n = $('.file-note', block); return n ? n.value : ''; }

function makeFile(url, name, size, note) {
  const b = newBlockEl('file');
  b.dataset.url = url; b.dataset.name = name; if (size) b.dataset.size = size;
  $('.block-body', b).appendChild(fileCard({
    icon: '📎', name, sub: size ? formatSize(size) : 'uploaded file', note,
    open: () => window.open(url, '_blank'),
  }));
  return b;
}
function makeLinkFile(filePath, name, note) {
  const b = newBlockEl('file');
  b.dataset.type = 'linkfile';
  b.dataset.path = filePath; b.dataset.name = name || (filePath || '').split('/').pop();
  $('.block-body', b).appendChild(fileCard({
    icon: '🔗', name: b.dataset.name, sub: filePath, note,
    open: () => openLinkedFile(filePath),
  }));
  return b;
}
function openLinkedFile(filePath) {
  api.openFile(filePath).then((r) => { if (r && r.error) setStatus('error', 'File not found'); }).catch(() => {});
}

// sub-page block: a file-link-style card that opens a child page, with a note
// isLink: true for a "/Link to page" reference (deleting it just removes the link),
// false/undefined for an owned sub-page (deleting it orphans the sub-page so it's recoverable)
function makePage(pageId, note, isLink) {
  const b = newBlockEl('paragraph');
  b.dataset.type = 'page'; b.dataset.pageId = pageId;
  if (isLink) b.dataset.link = '1';
  const body = $('.block-body', b);
  body.contentEditable = 'false';
  const child = state.docs.find((d) => d.id === pageId);
  body.appendChild(fileCard({
    icon: (child && child.icon) || '📄',
    name: (child && child.title) || 'Untitled',
    sub: isLink ? 'Link ›' : 'Page ›',
    note,
    open: () => openDoc(pageId),
  }));
  return b;
}
/* column layout block (2–5 columns; each column holds real blocks) */
function makeColumns(n, contents) {
  n = Math.max(2, Math.min(5, parseInt(n, 10) || 2));
  const block = document.createElement('div');
  block.className = 'block';
  block.dataset.type = 'columns';
  block.dataset.cols = n;

  const gutter = document.createElement('div');
  gutter.className = 'block-gutter';
  gutter.appendChild(makeAddButton(block));
  const handle = document.createElement('div');
  handle.className = 'block-handle';
  handle.textContent = '⋮⋮';
  handle.setAttribute('draggable', 'true');
  handle.title = 'Drag to move';
  gutter.appendChild(handle);
  block.appendChild(gutter);

  const wrap = document.createElement('div');
  wrap.className = 'cols-wrap';
  wrap.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  for (let k = 0; k < n; k++) {
    const col = document.createElement('div');
    col.className = 'col';
    const sub = parseMarkdown((contents && contents[k] != null) ? contents[k] : '');
    if (!sub.length) col.appendChild(newBlockEl('paragraph'));
    else sub.forEach((sb) => col.appendChild(buildBlock(sb)));
    wrap.appendChild(col);
  }
  block.appendChild(wrap);
  return block;
}

function formatSize(n) {
  n = +n; if (!n) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${u[i]}`;
}

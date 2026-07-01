/* ------------------------------------------------------------------ *
 *  Document list / open / new / delete
 * ------------------------------------------------------------------ */
async function loadDocs() {
  state.docs = await api.list();
  renderDocList();
}

// breadcrumb trail: walk parent chain up from the current page
function renderBreadcrumb(currentId, currentTitle, parentId) {
  const bc = $('#breadcrumb');
  const chain = [];
  let pid = parentId, safety = 30;
  while (pid && safety-- > 0) {
    const p = state.docs.find((d) => d.id === pid);
    if (!p) break;
    chain.unshift({ id: p.id, title: p.title || 'Untitled' });
    pid = p.parent;
  }
  chain.push({ id: currentId, title: currentTitle || 'Untitled', current: true });
  bc.innerHTML = chain.map((c, i) =>
    `${i > 0 ? '<span class="bc-sep">/</span>' : ''}<span class="bc-item${c.current ? ' current' : ''}" data-id="${c.id}">${escapeHtml(c.title || 'Untitled')}</span>`).join('');
  $$('.bc-item', bc).forEach((el) => { if (!el.classList.contains('current')) el.addEventListener('click', () => openDoc(el.dataset.id)); });
}
// an orphaned page: explicitly flagged, or its parent page no longer exists
function isOrphan(d) { return d.orphaned || (d.parent && !state.docs.some((x) => x.id === d.parent)); }

let collapsedPages = new Set();
try { collapsedPages = new Set(JSON.parse(localStorage.getItem('datac:collapsed:' + WS) || '[]')); } catch (_) {}
function saveCollapsed() { try { localStorage.setItem('datac:collapsed:' + WS, JSON.stringify([...collapsedPages])); } catch (_) {} }

/* ---- page status (topbar dropdown) ---- */
const STATUSES = [
  { key: 'not-started', label: 'Not started', color: '#9CA3AF' },
  { key: 'writing', label: 'Writing', color: '#3B82F6' },
  { key: 'reviewing', label: 'Reviewing', color: '#F59E0B' },
  { key: 'revising', label: 'Revising', color: '#F97316' },
  { key: 'done', label: 'Done', color: '#22C55E' },
];
function statusInfo(key) { return STATUSES.find((s) => s.key === key) || STATUSES[0]; }
const statusBtn = $('#status-btn');
const statusMenu = $('#status-menu');
function renderStatus() {
  const s = statusInfo(state.status);
  $('.status-dot', statusBtn).style.background = s.color;
  $('.status-label', statusBtn).textContent = s.label;
}
(function buildStatusMenu() {
  statusMenu.innerHTML = STATUSES.map((s) => `<button class="status-item" data-key="${s.key}"><span class="status-dot" style="background:${s.color}"></span>${s.label}</button>`).join('');
  statusMenu.addEventListener('click', (e) => { const it = e.target.closest('.status-item'); if (!it) return; setPageStatus(it.dataset.key); closeStatusMenu(); });
})();
function openStatusMenu() { const r = statusBtn.getBoundingClientRect(); statusMenu.hidden = false; statusMenu.style.top = (r.bottom + window.scrollY + 5) + 'px'; statusMenu.style.left = Math.min(r.left + window.scrollX, window.innerWidth - 200) + 'px'; }
function closeStatusMenu() { statusMenu.hidden = true; }
function setPageStatus(key) { state.status = key; renderStatus(); refreshStatusDot(); queueSave(); }
function refreshStatusDot() { const el = $(`.doc-item[data-id="${state.currentId}"] .doc-status-dot`, docList); if (el) el.style.background = statusInfo(state.status).color; const d = state.docs.find((x) => x.id === state.currentId); if (d) d.status = state.status; }
statusBtn.addEventListener('click', (e) => { e.stopPropagation(); statusMenu.hidden ? openStatusMenu() : closeStatusMenu(); });

function renderDocList() {
  // children map (non-orphan sub-pages), keyed by parent id
  const kids = {};
  state.docs.forEach((d) => {
    if (d.parent && !d.orphaned && state.docs.some((x) => x.id === d.parent)) (kids[d.parent] || (kids[d.parent] = [])).push(d);
  });
  // order each parent's children to match its page-link flow (childOrder); extras go last
  Object.keys(kids).forEach((pid) => {
    const order = (state.docs.find((d) => d.id === pid) || {}).childOrder || [];
    kids[pid].sort((a, b) => {
      const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });
  });
  // top-level (parent) pages sorted oldest → newest by creation time
  const roots = state.docs.filter((d) => !d.parent && !d.orphaned)
    .sort((a, b) => String(a.created || '').localeCompare(String(b.created || '')));
  const orphans = state.docs.filter((d) => isOrphan(d));

  // keep the active page's ancestors expanded so it stays visible
  let pid = (state.docs.find((d) => d.id === state.currentId) || {}).parent;
  while (pid) { collapsedPages.delete(pid); pid = (state.docs.find((d) => d.id === pid) || {}).parent; }

  const nodeHtml = (d, depth, orphan) => {
    const children = kids[d.id] || [];
    const hasKids = children.length > 0;
    const collapsed = collapsedPages.has(d.id);
    let h = `
    <div class="doc-item ${d.id === state.currentId ? 'active' : ''}" data-id="${d.id}" ${orphan ? 'data-orphan="1"' : ''} style="padding-left:${9 + depth * 14}px">
      <span class="doc-twist${hasKids ? '' : ' empty'}" data-twist="${d.id}">${hasKids ? (collapsed ? '▸' : '▾') : ''}</span>
      <span class="doc-emoji">${escapeHtml(d.icon || '📄')}</span>
      <span class="doc-title">${escapeHtml(d.title || 'Untitled')}</span>
      <span class="doc-status-dot" title="${statusInfo(d.status).label}" style="background:${statusInfo(d.status).color}"></span>
      <button class="doc-opts" title="Options" aria-label="Options">⋯</button>
    </div>`;
    if (hasKids && !collapsed) h += children.map((c) => nodeHtml(c, depth + 1, false)).join('');
    return h;
  };

  let html = roots.map((d) => nodeHtml(d, 0, false)).join('') || '<div class="slash-empty">No pages yet</div>';
  if (orphans.length) html += `<div class="doc-section">Orphaned pages</div>` + orphans.map((d) => nodeHtml(d, 0, true)).join('');
  docList.innerHTML = html;

  $$('.doc-item', docList).forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.doc-opts')) return;
      const tw = e.target.closest('.doc-twist');
      if (tw && !tw.classList.contains('empty')) {
        e.stopPropagation();
        const id = tw.dataset.twist;
        if (collapsedPages.has(id)) collapsedPages.delete(id); else collapsedPages.add(id);
        saveCollapsed(); renderDocList();
        return;
      }
      openDoc(el.dataset.id);
    });
    const opts = $('.doc-opts', el);
    if (opts) opts.addEventListener('click', (e) => { e.stopPropagation(); openPageMenu(el.dataset.id, opts, el.dataset.orphan === '1'); });
  });
}

/* ---- orphan / restore helpers ---- */
function docFields(d) { return { title: d.title, icon: d.icon, cover: d.cover, parent: d.parent || '', status: d.status || '', blocks: d.blocks || [], comments: d.comments || {}, orphaned: !!d.orphaned }; }
async function orphanPage(pageId) {
  try { const d = await api.get(pageId); if (d && !d.error) { await api.save(pageId, { ...docFields(d), orphaned: true }); await loadDocs(); } } catch (_) {}
}
async function restorePage(pageId) {
  try { const d = await api.get(pageId); if (d && !d.error) { await api.save(pageId, { ...docFields(d), orphaned: false, parent: '' }); await loadDocs(); } } catch (_) {}
}
// re-attach an orphaned page as a sub-page of its parent (adds a page link at the bottom of the parent)
async function reattachPage(pageId) {
  const child = await api.get(pageId).catch(() => null);
  if (!child || child.error) return;
  const parentId = child.parent;
  const parentInList = state.docs.find((d) => d.id === parentId);
  if (!parentId || !parentInList) { await restorePage(pageId); return; }  // parent gone → top level
  await api.save(pageId, { ...docFields(child), orphaned: false });        // un-orphan (keep parent)
  if (state.currentId === parentId) {
    // append the link to the live parent page and save
    if (![...editor.children].some((el) => el.dataset && el.dataset.pageId === pageId)) editor.appendChild(makePage(pageId));
    ensureTrailingParagraph(); refresh();
    await saveNow();
  } else {
    const parent = await api.get(parentId).catch(() => null);
    if (parent && !parent.error) {
      const blocks = (parent.blocks || []).slice();
      if (!blocks.some((b) => b.type === 'page' && b.pageId === pageId)) blocks.push({ id: randomId(), type: 'page', pageId, note: '' });
      await api.save(parentId, { ...docFields(parent), blocks });
    }
  }
  await loadDocs();
}

/* ---- existing-page picker (Link to page) ---- */
const pagePicker = $('#page-picker');
let pagePickerCb = null;
function renderPagePickerList(q) {
  const f = (q || '').toLowerCase();
  const items = state.docs.filter((d) => d.id !== state.currentId && (!f || (d.title || '').toLowerCase().includes(f)));
  $('#pp-list', pagePicker).innerHTML = items.map((d) =>
    `<button class="pp-item" data-id="${d.id}"><span class="pp-ico">${escapeHtml(d.icon || '📄')}</span><span class="pp-title">${escapeHtml(d.title || 'Untitled')}</span></button>`).join('') || '<div class="pp-empty">No pages</div>';
  $$('.pp-item', pagePicker).forEach((el) => el.addEventListener('mousedown', (e) => { e.preventDefault(); const cb = pagePickerCb; closePagePicker(); if (cb) cb(el.dataset.id); }));
}
function openPagePicker(anchor, cb) {
  pagePickerCb = cb;
  renderPagePickerList('');
  const r = anchor.getBoundingClientRect();
  pagePicker.hidden = false;
  pagePicker.style.top = (r.bottom + window.scrollY + 6) + 'px';
  pagePicker.style.left = Math.min(r.left + window.scrollX, window.innerWidth - 296) + 'px';
  const s = $('#pp-search', pagePicker); s.value = ''; setTimeout(() => s.focus(), 0);
}
function closePagePicker() { pagePicker.hidden = true; pagePickerCb = null; }
$('#pp-search', pagePicker).addEventListener('input', (e) => renderPagePickerList(e.target.value));
$('#pp-search', pagePicker).addEventListener('keydown', (e) => { if (e.key === 'Escape') closePagePicker(); });

/* ---- sidebar page options menu ---- */
const pageMenu = $('#page-menu');
let pageMenuId = null;
function openPageMenu(id, anchor, orphan) {
  pageMenuId = id;
  const doc = state.docs.find((d) => d.id === id) || {};
  const hasParent = doc.parent && state.docs.some((x) => x.id === doc.parent);
  $('.menu-item[data-act="reattach"]', pageMenu).hidden = !(orphan && hasParent);
  $('.menu-item[data-act="restore"]', pageMenu).hidden = !orphan;
  const r = anchor.getBoundingClientRect();
  pageMenu.hidden = false;
  pageMenu.style.top = (r.bottom + window.scrollY + 4) + 'px';
  pageMenu.style.left = Math.min(r.left + window.scrollX, window.innerWidth - 180) + 'px';
}
function closePageMenu() { pageMenu.hidden = true; pageMenuId = null; }
pageMenu.addEventListener('click', async (e) => {
  const item = e.target.closest('.menu-item');
  if (!item || !pageMenuId) return;
  const id = pageMenuId;
  closePageMenu();
  if (item.dataset.act === 'delete') { deleteDoc(id); return; }
  if (item.dataset.act === 'reattach') { await reattachPage(id); return; }
  if (item.dataset.act === 'restore') { await restorePage(id); return; }
  if (item.dataset.act === 'rename') {
    const doc = state.docs.find((d) => d.id === id);
    const name = prompt('Rename page:', doc ? doc.title : '');
    if (name == null) return;
    if (id === state.currentId) { titleInput.value = name === 'Untitled' ? '' : name; fitTitle(); queueSave(); }
    else { const full = await api.get(id); await api.save(id, { ...full, title: name || 'Untitled' }); await loadDocs(); renderDocList(); }
    return;
  }
  if (item.dataset.act === 'duplicate') {
    if (id === state.currentId && state.dirty) await saveNow();
    let full = await api.get(id);
    if (full.format === 'markdown') { await openDoc(id); await saveNow(); full = await api.get(id); } // migrate first
    const copy = await api.create({ title: (full.title || 'Untitled') + ' copy', icon: full.icon, cover: full.cover, blocks: full.blocks || [], comments: full.comments || {} });
    await loadDocs();
    openDoc(copy.id);
    return;
  }
  if (item.dataset.act === 'export') {
    if (id !== state.currentId) await openDoc(id);
    downloadMarkdown();
    return;
  }
});

async function openDoc(id) {
  if (state.dirty) await saveNow();
  closeCommentPopover(); closeEmojiPicker(); closeCoverMenu();
  const doc = await api.get(id);
  state.currentId = id;
  state.icon = doc.icon || '';
  state.cover = doc.cover || '';
  state.parent = doc.parent || '';
  state.status = doc.status || '';
  state.comments = doc.comments && typeof doc.comments === 'object' ? doc.comments : {};
  titleInput.value = doc.title === 'Untitled' ? '' : (doc.title || '');
  renderBreadcrumb(id, doc.title, doc.parent);
  renderStatus();

  let migrated = false;
  if (doc.format === 'markdown') {
    // legacy page → build from markdown, apply legacy colours, then save as JSON
    state.styles = doc.styles && typeof doc.styles === 'object' ? doc.styles : {};
    renderBlocks(parseMarkdown(doc.content));
    migrated = true;
  } else {
    renderDocJson(doc);
  }
  renderHead();
  $('#doc-empty').hidden = true;
  $('#doc').hidden = false;
  fitTitle();   // must run AFTER the doc is visible, else scrollHeight is 0 and the title collapses
  $$('.file-note', editor).forEach(autoGrow);
  setStatus('saved', 'Saved');
  state.dirty = false;
  resetHistory();
  renderDocList();
  if (migrated) { state.dirty = true; await saveNow(); resetHistory(); }
  // focus first block if empty
  const firstBody = $('.block-body[contenteditable="true"]', editor);
  if (firstBody && firstBody.textContent.trim() === '' && !doc.title) titleInput.focus();
}

async function newDoc() {
  if (state.dirty) await saveNow();
  const meta = await api.create();
  await loadDocs();
  await openDoc(meta.id);
  titleInput.focus();
}

async function deleteDoc(id) {
  const doc = state.docs.find((d) => d.id === id);
  if (!confirm(`Delete "${doc ? doc.title : 'this page'}"? This cannot be undone.`)) return;
  await api.remove(id);
  if (state.currentId === id) {
    state.currentId = null;
    $('#doc').hidden = true;
    $('#doc-empty').hidden = false;
    $('#breadcrumb').textContent = '';
  }
  await loadDocs();
}

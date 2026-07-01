/* ------------------------------------------------------------------ *
 *  Undo / redo history (whole-document snapshots)
 * ------------------------------------------------------------------ */
// pointer into a single timeline — undo/redo just move the pointer (no re-capture),
// so a non-byte-identical re-render can never make it oscillate or get stuck.
let history = [];
let histIndex = -1;
let histDirty = false;
let undoTimer = null;

function snapshot() { return JSON.stringify(docToJson()); }
function resetHistory() { history = [snapshot()]; histIndex = 0; histDirty = false; clearTimeout(undoTimer); }
function captureHistory() {
  clearTimeout(undoTimer);
  histDirty = false;
  const s = snapshot();
  if (histIndex >= 0 && s === history[histIndex]) return;
  history = history.slice(0, histIndex + 1);   // drop any redo branch
  history.push(s);
  if (history.length > 300) history.shift();
  histIndex = history.length - 1;
}
function scheduleHistory() { histDirty = true; clearTimeout(undoTimer); undoTimer = setTimeout(captureHistory, 350); }
function applySnapshot(s) {
  const o = JSON.parse(s);
  titleInput.value = o.title === 'Untitled' ? '' : (o.title || '');
  fitTitle();
  state.icon = o.icon || ''; state.cover = o.cover || ''; state.parent = o.parent || '';
  state.comments = o.comments || {};
  renderBreadcrumb(state.currentId, o.title, o.parent);
  renderDocJson(o);
  renderHead();
}
function undo() {
  if (histDirty) captureHistory();   // fold in any pending edit first
  clearTimeout(undoTimer);
  if (histIndex <= 0) return;
  histIndex--;
  applySnapshot(history[histIndex]);
  state.dirty = true; saveNow();
}
function redo() {
  clearTimeout(undoTimer);
  if (histIndex >= history.length - 1) return;
  histIndex++;
  applySnapshot(history[histIndex]);
  state.dirty = true; saveNow();
}

/* ------------------------------------------------------------------ *
 *  Autosave
 * ------------------------------------------------------------------ */
let saveTimer = null;
function queueSave() {
  if (!state.currentId) return;
  state.dirty = true;
  setStatus('saving', 'Saving…');
  scheduleHistory();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 700);
}

function pruneComments() {
  const present = new Set($$('.block[data-bid]', editor).map((b) => b.dataset.bid));
  for (const bid of Object.keys(state.comments)) {
    if (!present.has(bid) || !state.comments[bid] || !state.comments[bid].length) delete state.comments[bid];
  }
  for (const bid of Object.keys(state.styles)) {
    const s = state.styles[bid];
    if (!present.has(bid) || !s || (!s.tc && !s.bg)) delete state.styles[bid];
  }
}

async function saveNow(keepalive = false) {
  if (!state.currentId || state.saving) return;
  clearTimeout(saveTimer);
  state.saving = true;
  const doc = docToJson();
  const title = doc.title;
  try {
    await api.save(state.currentId, doc, keepalive);
    state.dirty = false;
    setStatus('saved', 'Saved');
    const item = state.docs.find((d) => d.id === state.currentId);
    if (item) { item.title = title; item.icon = state.icon; }
    const el = $(`.doc-item[data-id="${state.currentId}"] .doc-title`, docList);
    if (el) el.textContent = title;
    const ico = $(`.doc-item[data-id="${state.currentId}"] .doc-emoji`, docList);
    if (ico) ico.textContent = state.icon || '📄';
  } catch (err) {
    setStatus('error', 'Save failed');
  } finally {
    state.saving = false;
    if (state.dirty) queueSave();
  }
}

function setStatus(stateName, text) {
  saveStatus.dataset.state = stateName;
  saveStatus.textContent = text;
}

// grow the title textarea to fit long, wrapping titles
function fitTitle() { titleInput.style.height = 'auto'; titleInput.style.height = titleInput.scrollHeight + 'px'; }
titleInput.addEventListener('input', () => {
  fitTitle(); queueSave();
  const cur = $('#breadcrumb .bc-item.current');
  if (cur) cur.textContent = titleInput.value || 'Untitled';
});
titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || (e.key === 'ArrowDown' && caretAtEndInput())) {
    e.preventDefault();
    const first = $('.block .block-body[contenteditable="true"]', editor);
    if (first) placeCaret(first, false);
  }
});
function caretAtEndInput() { return titleInput.selectionStart === titleInput.value.length; }

window.addEventListener('beforeunload', () => { if (state.dirty) saveNow(true); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (state.dirty) saveNow(true); }
  else if (!state.currentId && state.docs && state.docs.length) openDoc(state.docs[0].id);
});

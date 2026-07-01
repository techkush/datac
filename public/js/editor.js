/* ------------------------------------------------------------------ *
 *  Caret helpers
 * ------------------------------------------------------------------ */
function currentBody() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  let n = sel.getRangeAt(0).startContainer;
  while (n && n !== editor) {
    if (n.nodeType === 1 && n.classList.contains('block-body')) return n;
    n = n.parentNode;
  }
  return null;
}
function blockOf(body) { return body ? body.closest('.block') : null; }

function caretAtStart(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0).cloneRange();
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setEnd(r.startContainer, r.startOffset);
  return probe.toString().length === 0;
}
function caretAtEnd(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return false;
  const r = sel.getRangeAt(0).cloneRange();
  const probe = document.createRange();
  probe.selectNodeContents(el);
  probe.setStart(r.endContainer, r.endOffset);
  return probe.toString().length === 0;
}
function placeCaret(el, atEnd = false) {
  el.focus();
  const sel = window.getSelection();
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(!atEnd);
  sel.removeAllRanges();
  sel.addRange(r);
}

/* ------------------------------------------------------------------ *
 *  Editor key handling
 * ------------------------------------------------------------------ */
editor.addEventListener('keydown', (e) => {
  if (!slashMenu.hidden && handleSlashKeys(e)) return;

  // Undo / Redo (our own history, since structural edits bypass native undo)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }

  const body = currentBody();
  const block = blockOf(body);

  // Cmd/Ctrl + S => force save
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); return; }
  // inline format shortcuts
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); document.execCommand('bold'); return; }
    if (k === 'i') { e.preventDefault(); document.execCommand('italic'); return; }
    if (k === 'u') { e.preventDefault(); document.execCommand('underline'); return; }
  }

  if (!body || !block) return;
  const type = block.dataset.type;

  // Space => markdown shortcuts
  if (e.key === ' ' && type === 'paragraph') {
    const txt = textBeforeCaret(body);
    const map = { '#': 'h1', '##': 'h2', '###': 'h3', '####': 'h4', '-': 'bulleted', '*': 'bulleted', '1.': 'numbered', '>': 'quote', '[]': 'todo', '[ ]': 'todo', '```': 'code' };
    if (map[txt] && body.textContent === txt) {
      e.preventDefault();
      body.innerHTML = '';
      setBlockType(block, map[txt]);
      placeCaret(body, true);
      queueSave();
      return;
    }
  }

  // Enter
  if (e.key === 'Enter') {
    if (type === 'code') {
      // newline inside code; Shift+Enter exits to new paragraph
      if (e.shiftKey) { e.preventDefault(); const nb = newBlockEl('paragraph'); block.after(nb); refresh(); placeCaret($('.block-body', nb)); queueSave(); }
      return; // let browser insert newline
    }
    if (e.shiftKey) return; // soft line break (browser inserts <br>/newline)
    e.preventDefault();

    // divider via "---"
    if (type === 'paragraph' && body.textContent.trim() === '---') {
      const div = makeDivider(); block.replaceWith(div);
      const nb = newBlockEl('paragraph'); div.after(nb); refresh(); placeCaret($('.block-body', nb)); queueSave(); return;
    }

    const emptyListLike = ['bulleted', 'numbered', 'todo', 'quote'].includes(type) && body.textContent.trim() === '';
    if (emptyListLike) { setBlockType(block, 'paragraph'); placeCaret(body); queueSave(); return; }

    // split at caret
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    if (!range.collapsed) range.deleteContents();
    const tail = document.createRange();
    tail.selectNodeContents(body);
    tail.setStart(range.endContainer, range.endOffset);
    const frag = tail.extractContents();

    let nextType = ['bulleted', 'numbered', 'todo'].includes(type) ? type : 'paragraph';
    const nb = newBlockEl(nextType);
    const nbBody = $('.block-body', nb);
    nbBody.appendChild(frag);
    block.after(nb);
    refresh();
    placeCaret(nbBody, false);
    queueSave();
    return;
  }

  // Backspace at start
  if (e.key === 'Backspace') {
    if (caretAtStart(body)) {
      if (type !== 'paragraph') { e.preventDefault(); setBlockType(block, 'paragraph'); placeCaret(body); queueSave(); return; }
      const prev = block.previousElementSibling;
      if (prev && prev.classList.contains('block')) {
        e.preventDefault();
        const prevBody = $('.block-body', prev);
        if (['divider', 'image', 'file'].includes(prev.dataset.type)) { prev.remove(); refresh(); queueSave(); return; }
        const atEndRange = document.createRange();
        atEndRange.selectNodeContents(prevBody);
        const lenBefore = prevBody.textContent.length;
        while (body.firstChild) prevBody.appendChild(body.firstChild);
        block.remove();
        // place caret at junction
        prevBody.focus();
        const sel = window.getSelection();
        const r = document.createRange();
        let off = 0, target = prevBody, found = false;
        // walk to lenBefore characters
        (function walk(node) {
          if (found) return;
          if (node.nodeType === 3) {
            if (off + node.length >= lenBefore) { r.setStart(node, lenBefore - off); found = true; return; }
            off += node.length;
          } else node.childNodes.forEach(walk);
        })(prevBody);
        if (!found) { r.selectNodeContents(prevBody); r.collapse(false); }
        else r.collapse(true);
        sel.removeAllRanges(); sel.addRange(r);
        refresh(); queueSave(); return;
      }
    }
  }

  // Arrow navigation between blocks
  if (e.key === 'ArrowUp' && caretAtStart(body)) {
    const prev = prevTextBlock(block); if (prev) { e.preventDefault(); placeCaret($('.block-body', prev), true); }
  }
  if (e.key === 'ArrowDown' && caretAtEnd(body)) {
    const next = nextTextBlock(block); if (next) { e.preventDefault(); placeCaret($('.block-body', next), false); }
  }
});

function prevTextBlock(block) {
  let p = block.previousElementSibling;
  while (p && !TEXT_TYPES.has(p.dataset.type)) p = p.previousElementSibling;
  return p;
}
function nextTextBlock(block) {
  let n = block.nextElementSibling;
  while (n && !TEXT_TYPES.has(n.dataset.type)) n = n.nextElementSibling;
  return n;
}

function textBeforeCaret(body) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return '';
  const r = document.createRange();
  r.selectNodeContents(body);
  r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return r.toString();
}

/* input => placeholders, autosave, slash menu */
editor.addEventListener('input', () => {
  refresh();
  queueSave();
  maybeOpenSlash();
});

/* ------------------------------------------------------------------ *
 *  Slash menu
 * ------------------------------------------------------------------ */
let slashState = { open: false, body: null, items: [], index: 0, query: '' };

function maybeOpenSlash() {
  const body = currentBody();
  const block = blockOf(body);
  if (!body || !block || !TEXT_TYPES.has(block.dataset.type)) { closeSlash(); return; }
  const txt = textBeforeCaret(body);
  const m = txt.match(/(?:^|\s)?\/([\w]*)$/);
  if (txt === '/' || (body.textContent.startsWith('/') && /^\/[\w]*$/.test(body.textContent.trim()))) {
    openSlash(body, body.textContent.trim().slice(1));
  } else {
    closeSlash();
  }
}

function openSlash(body, query) {
  slashState.open = true; slashState.body = body; slashState.query = query;
  const q = query.toLowerCase();
  slashState.items = BLOCK_TYPES.filter((b) => !q || b.label.toLowerCase().includes(q) || b.keys.includes(q));
  slashState.index = 0;
  renderSlash();
  positionSlash(body);
  slashMenu.hidden = false;
}
function renderSlash() {
  if (!slashState.items.length) { slashMenu.innerHTML = '<div class="slash-empty">No matching blocks</div>'; return; }
  slashMenu.innerHTML = '<div class="slash-section">Blocks</div>' + slashState.items.map((b, i) => `
    <div class="slash-item ${i === slashState.index ? 'active' : ''}" data-i="${i}">
      <span class="si-ico">${b.icon}</span>
      <span class="si-text"><span>${b.label}</span><small>${b.desc}</small></span>
    </div>`).join('');
  $$('.slash-item', slashMenu).forEach((el) => {
    el.addEventListener('mousedown', (ev) => { ev.preventDefault(); applySlash(+el.dataset.i); });
    el.addEventListener('mousemove', () => { slashState.index = +el.dataset.i; highlightSlash(); });
  });
}
function highlightSlash() {
  $$('.slash-item', slashMenu).forEach((el, i) => el.classList.toggle('active', i === slashState.index));
}
function positionSlash(body) {
  const sel = window.getSelection();
  let rect;
  if (sel.rangeCount) { const r = sel.getRangeAt(0).getClientRects()[0]; rect = r || body.getBoundingClientRect(); }
  else rect = body.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 6;
  let left = rect.left + window.scrollX;
  slashMenu.style.top = top + 'px';
  slashMenu.style.left = Math.min(left, window.innerWidth - 296) + 'px';
}
function closeSlash() { slashState.open = false; slashMenu.hidden = true; }

function handleSlashKeys(e) {
  if (e.key === 'ArrowDown') { e.preventDefault(); slashState.index = (slashState.index + 1) % slashState.items.length; highlightSlash(); return true; }
  if (e.key === 'ArrowUp') { e.preventDefault(); slashState.index = (slashState.index - 1 + slashState.items.length) % slashState.items.length; highlightSlash(); return true; }
  if (e.key === 'Enter') { e.preventDefault(); applySlash(slashState.index); return true; }
  if (e.key === 'Escape') { e.preventDefault(); closeSlash(); return true; }
  return false;
}

function applySlash(i) {
  const item = slashState.items[i];
  if (!item) return;
  const body = slashState.body;
  const block = blockOf(body);
  body.innerHTML = '';
  closeSlash();

  if (item.action === 'divider') {
    const div = makeDivider(); block.replaceWith(div);
    const nb = newBlockEl('paragraph'); div.after(nb); refresh(); placeCaret($('.block-body', nb)); queueSave(); return;
  }
  if (item.action === 'columns') {
    const cols = makeColumns(item.n);
    block.replaceWith(cols);
    const nb = newBlockEl('paragraph'); cols.after(nb);
    refresh(); placeCaret($('.col', cols)); queueSave(); return;
  }
  if (item.action === 'image' || item.action === 'file') {
    pendingInsert = { block, kind: item.action };
    filePicker.accept = item.action === 'image' ? 'image/*' : '';
    filePicker.click();
    return;
  }
  if (item.action === 'page') {
    const targetBlock = block;
    (async () => {
      if (state.dirty) await saveNow();
      const child = await api.create({ title: 'Untitled', blocks: [], parent: state.currentId });
      const el = makePage(child.id);
      targetBlock.replaceWith(el);
      const nb = newBlockEl('paragraph'); el.after(nb);
      refresh(); captureHistory();
      await saveNow();      // persist the parent with its new page link
      await loadDocs();     // child now exists in the list
      openDoc(child.id);    // navigate into the new sub-page
    })();
    return;
  }
  if (item.action === 'pagelink') {
    const targetBlock = block;
    // open the picker on the next tick so this mousedown doesn't immediately close it
    setTimeout(() => openPagePicker(targetBlock, (pageId) => {
      const el = makePage(pageId);
      targetBlock.replaceWith(el);
      const nb = newBlockEl('paragraph'); el.after(nb);
      refresh(); placeCaret($('.block-body', nb)); ensureTrailingParagraph(); captureHistory(); queueSave();
    }), 0);
    return;
  }
  if (item.action === 'linkfile') {
    const targetBlock = block;
    setStatus('saving', 'Choose a file…');
    api.pickFile().then((res) => {
      setStatus('saved', 'Saved');
      if (!res || !res.path) return;   // cancelled
      const el = makeLinkFile(res.path, res.name);
      targetBlock.replaceWith(el);
      const nb = newBlockEl('paragraph'); el.after(nb);
      refresh(); placeCaret($('.block-body', nb)); captureHistory(); queueSave();
    }).catch(() => setStatus('error', 'Picker failed'));
    return;
  }
  setBlockType(block, item.type);
  placeCaret(body, true);
  queueSave();
}

/* ------------------------------------------------------------------ *
 *  File upload (image / file blocks + paste)
 * ------------------------------------------------------------------ */
let pendingInsert = null;
let pendingCover = false;

filePicker.addEventListener('change', async () => {
  const file = filePicker.files[0];
  filePicker.value = '';
  if (!file) return;
  if (pendingCover) {
    pendingCover = false;
    setStatus('saving', 'Uploading…');
    try { const res = await api.upload(file.name, await readAsDataURL(file)); setCover(res.url); saveNow(); }
    catch (_) { setStatus('error', 'Upload failed'); }
    return;
  }
  if (!pendingInsert) return;
  const { block, kind } = pendingInsert;
  pendingInsert = null;
  await insertUpload(file, kind, block);
});

async function insertUpload(file, kind, replaceBlock) {
  setStatus('saving', 'Uploading…');
  const dataUrl = await readAsDataURL(file);
  const isImage = kind === 'image' || file.type.startsWith('image/');
  try {
    const res = await api.upload(file.name, dataUrl);
    const el = isImage ? makeImage(res.url, file.name) : makeFile(res.url, file.name, res.size);
    if (replaceBlock) { replaceBlock.replaceWith(el); }
    else { editor.appendChild(el); }
    const nb = newBlockEl('paragraph'); el.after(nb);
    refresh(); placeCaret($('.block-body', nb)); saveNow();
  } catch (err) { setStatus('error', 'Upload failed'); }
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

// convert arbitrary pasted HTML into our markdown so it round-trips on save/reload
function pastedHtmlToMarkdown(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  // strip noise
  tmp.querySelectorAll('style,script,meta,link,title').forEach((n) => n.remove());
  const out = [];
  const inline = (node) => richInline(node).replace(/[ \t]+\n/g, "\n");
  const walk = (node) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) { const t = n.textContent.replace(/\s+/g, ' '); if (t.trim()) out.push(t.trim()); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toLowerCase();
      switch (tag) {
        case 'h1': out.push('# ' + inline(n)); break;
        case 'h2': out.push('## ' + inline(n)); break;
        case 'h3': out.push('### ' + inline(n)); break;
        case 'h4': case 'h5': case 'h6': out.push('#### ' + inline(n)); break;
        case 'ul': n.querySelectorAll(':scope > li').forEach((li) => out.push('- ' + inline(li))); break;
        case 'ol': Array.from(n.querySelectorAll(':scope > li')).forEach((li, i) => out.push((i + 1) + '. ' + inline(li))); break;
        case 'blockquote': inline(n).split('\n').forEach((l) => out.push('> ' + l)); break;
        case 'pre': out.push('```\n' + n.textContent.replace(/\n$/, '') + '\n```'); break;
        case 'hr': out.push('---'); break;
        case 'table': out.push('<!--table-->'); out.push(sanitizeHtml(n.outerHTML)); out.push('<!--/table-->'); break;
        case 'p': case 'div': case 'section': case 'article': case 'header': case 'footer': case 'main': {
          const md = inline(n).trim();
          if (md) out.push(md); else walk(n);
          break;
        }
        case 'br': break;
        default: { const md = inline(n).trim(); if (md) out.push(md); else walk(n); }
      }
    });
  };
  walk(tmp);
  return out.join('\n\n');
}

// insert parsed blocks at the caret (replacing the current block if it's empty)
function insertParsedBlocks(parsed) {
  const body = currentBody();
  const block = blockOf(body);
  const els = parsed.map(buildBlock);
  if (!block) { els.forEach((el) => editor.appendChild(el)); }
  else if (body && TEXT_TYPES.has(block.dataset.type) && body.textContent.trim() === '') {
    els.forEach((el) => block.parentElement.insertBefore(el, block));
    block.remove();
  } else {
    let ref = block;
    els.forEach((el) => { ref.after(el); ref = el; });
  }
  $$('.block[data-type="todo"]', editor).forEach((b) => { const cb = $('.todo-check', b); if (cb) cb.checked = b.classList.contains('checked'); });
  ensureTrailingParagraph();
  refresh(); refreshCommentBadges();
  const last = els[els.length - 1];
  const lb = last && $('.block-body', last);
  if (lb) placeCaret(lb, true);
  captureHistory(); queueSave();
}

editor.addEventListener('paste', (e) => {
  const cd = e.clipboardData;
  if (!cd) return;

  // images / files
  if (cd.files && cd.files.length) {
    const file = cd.files[0];
    if (file) {
      e.preventDefault();
      const body = currentBody();
      const block = blockOf(body);
      const target = (block && TEXT_TYPES.has(block.dataset.type) && body.textContent.trim() === '') ? block : null;
      insertUpload(file, file.type.startsWith('image/') ? 'image' : 'file', target);
    }
    return;
  }

  const body = currentBody();
  const block = blockOf(body);
  if (!block) return;

  // inside a code block: paste as plain text only
  if (block.dataset.type === 'code') {
    e.preventDefault();
    document.execCommand('insertText', false, cd.getData('text/plain'));
    queueSave();
    return;
  }

  const html = cd.getData('text/html');
  const text = cd.getData('text/plain');
  if (!html && !text) return;

  e.preventDefault();
  captureHistory(); // snapshot before paste so it can be undone
  const md = html ? pastedHtmlToMarkdown(html) : text;
  const parsed = parseMarkdown(md);

  if (!parsed.length) return;
  // a single plain paragraph inserts inline at the caret; anything else
  // (tables, images, lists, multiple blocks) is inserted as real blocks
  if (parsed.length === 1 && parsed[0].type === 'paragraph') {
    const inlineHtml = parsed[0].md != null ? renderInline(parsed[0].md) : escapeHtml(text);
    document.execCommand('insertHTML', false, inlineHtml);
    refresh(); captureHistory(); queueSave();
  } else {
    insertParsedBlocks(parsed);
  }
});

/* ------------------------------------------------------------------ *
 *  Inline selection toolbar
 * ------------------------------------------------------------------ */
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) { inlineToolbar.hidden = true; return; }
  const body = currentBody();
  const block = blockOf(body);
  const inCol = sel.anchorNode && sel.anchorNode.parentElement && sel.anchorNode.parentElement.closest('.col');
  const textBlock = body && block && TEXT_TYPES.has(block.dataset.type);
  if (!textBlock && !inCol) { inlineToolbar.hidden = true; return; }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  if (!rect.width) { inlineToolbar.hidden = true; return; }
  inlineToolbar.hidden = false;
  inlineToolbar.style.top = (rect.top + window.scrollY - inlineToolbar.offsetHeight - 8) + 'px';
  inlineToolbar.style.left = (rect.left + window.scrollX + rect.width / 2 - inlineToolbar.offsetWidth / 2) + 'px';
});

inlineToolbar.addEventListener('mousedown', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  e.preventDefault();
  const cmd = btn.dataset.cmd;
  if (cmd === 'code') { toggleInlineCode(); }
  else if (cmd === 'link') {
    const url = prompt('Link URL:');
    if (url) document.execCommand('createLink', false, url);
  } else {
    document.execCommand(cmd);
  }
  queueSave();
});

function toggleInlineCode() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  let anc = range.commonAncestorContainer;
  if (anc.nodeType === 3) anc = anc.parentNode;
  const codeEl = anc.closest && anc.closest('code');
  if (codeEl) {
    const parent = codeEl.parentNode;
    while (codeEl.firstChild) parent.insertBefore(codeEl.firstChild, codeEl);
    parent.removeChild(codeEl);
  } else {
    const text = range.toString();
    if (!text) return;
    const code = document.createElement('code');
    code.textContent = text;
    range.deleteContents();
    range.insertNode(code);
  }
}

/* ------------------------------------------------------------------ *
 *  Drag-to-reorder blocks
 * ------------------------------------------------------------------ */
let dragged = null;
editor.addEventListener('dragstart', (e) => {
  const handle = e.target.closest('.block-handle');
  if (!handle) { e.preventDefault(); return; }
  dragged = handle.closest('.block');
  dragged.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
editor.addEventListener('dragover', (e) => {
  if (!dragged) return;
  e.preventDefault();
  const over = e.target.closest('.block');
  $$('.block', editor).forEach((b) => b.classList.remove('drop-before', 'drop-after'));
  if (over && over !== dragged) {
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    over.classList.add(after ? 'drop-after' : 'drop-before');
  }
});
editor.addEventListener('drop', (e) => {
  if (!dragged) return;
  e.preventDefault();
  const over = e.target.closest('.block');
  // don't drop a block into itself (e.g. a columns block into its own column)
  if (over && over !== dragged && !dragged.contains(over)) {
    const rect = over.getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    over.parentNode.insertBefore(dragged, after ? over.nextSibling : over);
  }
  // any column emptied by the move gets a fresh paragraph
  $$('.col', editor).forEach((col) => { if (!col.querySelector(':scope > .block')) col.appendChild(newBlockEl('paragraph')); });
  cleanupDrag(); refresh(); queueSave();
});
editor.addEventListener('dragend', cleanupDrag);
function cleanupDrag() {
  if (dragged) dragged.classList.remove('dragging');
  $$('.block', editor).forEach((b) => b.classList.remove('drop-before', 'drop-after'));
  dragged = null;
}

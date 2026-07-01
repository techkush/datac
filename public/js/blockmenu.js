/* ================================================================== *
 *  Block handle menu: delete / duplicate / turn into / color
 * ================================================================== */
const blockMenu = $('#block-menu');
let menuBlock = null;

const TURN_INTO = [
  { type: 'paragraph', label: 'Text', icon: '¶' },
  { type: 'h1', label: 'Heading 1', icon: 'H₁' },
  { type: 'h2', label: 'Heading 2', icon: 'H₂' },
  { type: 'h3', label: 'Heading 3', icon: 'H₃' },
  { type: 'h4', label: 'Heading 4', icon: 'H₄' },
  { type: 'bulleted', label: 'Bulleted list', icon: '•' },
  { type: 'numbered', label: 'Numbered list', icon: '1.' },
  { type: 'todo', label: 'To-do list', icon: '☑' },
  { type: 'quote', label: 'Quote', icon: '❝' },
  { type: 'code', label: 'Code', icon: '</>' },
];
// 10 colours (name -> applied via [data-tc]/[data-bg] in CSS)
const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'red'];

function ensureBid(block) { if (!block.dataset.bid) block.dataset.bid = randomId(); return block.dataset.bid; }

function buildBlockMenu() {
  const swatch = (kind, c) => `<button class="bm-swatch ${kind}-${c}" data-kind="${kind}" data-color="${c}" title="${c}">${kind === 'tc' ? 'A' : ''}</button>`;
  blockMenu.innerHTML = `
    <button class="bm-row" data-act="delete">🗑️ <span>Delete</span></button>
    <button class="bm-row" data-act="duplicate">⧉ <span>Duplicate</span></button>
    <div class="bm-sep"></div>
    <div class="bm-label">Turn into</div>
    <div class="bm-turn">
      ${TURN_INTO.map((t) => `<button class="bm-turn-item" data-type="${t.type}"><span class="bm-ico">${t.icon}</span>${t.label}</button>`).join('')}
    </div>
    <div class="bm-sep"></div>
    <div class="bm-label">Text color</div>
    <div class="bm-colors">${COLORS.map((c) => swatch('tc', c)).join('')}</div>
    <div class="bm-label">Background</div>
    <div class="bm-colors">${COLORS.map((c) => swatch('bg', c)).join('')}</div>`;

  blockMenu.addEventListener('click', (e) => {
    if (!menuBlock) return;
    const row = e.target.closest('.bm-row');
    if (row) { row.dataset.act === 'delete' ? deleteBlock(menuBlock) : duplicateBlock(menuBlock); closeBlockMenu(); return; }
    const turn = e.target.closest('.bm-turn-item');
    if (turn) { turnInto(menuBlock, turn.dataset.type); closeBlockMenu(); return; }
    const sw = e.target.closest('.bm-swatch');
    if (sw) { setBlockColor(menuBlock, sw.dataset.kind, sw.dataset.color); /* keep menu open */ }
  });
}

function openBlockMenu(block, anchor) {
  menuBlock = block;
  const r = anchor.getBoundingClientRect();
  blockMenu.hidden = false;
  let top = r.bottom + window.scrollY + 4;
  let left = r.left + window.scrollX;
  if (left + 260 > window.innerWidth) left = window.innerWidth - 268;
  if (top + blockMenu.offsetHeight > window.scrollY + window.innerHeight) top = window.scrollY + window.innerHeight - blockMenu.offsetHeight - 8;
  blockMenu.style.top = Math.max(8 + window.scrollY, top) + 'px';
  blockMenu.style.left = Math.max(8, left) + 'px';
}
function closeBlockMenu() { blockMenu.hidden = true; menuBlock = null; }

function turnInto(block, type) {
  if (block.dataset.type === type) return;
  if (['image', 'file', 'linkfile', 'page', 'divider', 'columns', 'table'].includes(block.dataset.type)) return;
  setBlockType(block, type);
  const body = $('.block-body', block);
  placeCaret(body, true);
  queueSave();
}

function duplicateBlock(block) {
  const type = block.dataset.type;
  const body = $('.block-body', block);
  let nb;
  if (type === 'divider') nb = makeDivider();
  else if (type === 'columns') nb = makeColumns(+block.dataset.cols || 2, $$('.col', block).map((c) => inlineHtmlToMd(c)));
  else if (type === 'image') nb = makeImage(block.dataset.url, block.dataset.alt);
  else if (type === 'file') nb = makeFile(block.dataset.url, block.dataset.name, block.dataset.size, noteOf(block));
  else if (type === 'linkfile') nb = makeLinkFile(block.dataset.path, block.dataset.name, noteOf(block));
  else if (type === 'page') nb = makePage(block.dataset.pageId, noteOf(block));
  else if (type === 'table') nb = makeTable($(':scope > .block-body', block).innerHTML);
  else {
    nb = newBlockEl(type);
    const nbody = $('.block-body', nb);
    if (type === 'code') nbody.innerText = body.innerText; else nbody.innerHTML = body.innerHTML;
    if (block.classList.contains('checked')) nb.classList.add('checked');
  }
  if (block.dataset.tc) nb.dataset.tc = block.dataset.tc;
  if (block.dataset.bg) nb.dataset.bg = block.dataset.bg;
  if (nb.dataset.tc || nb.dataset.bg) { const bid = ensureBid(nb); state.styles[bid] = { tc: nb.dataset.tc || '', bg: nb.dataset.bg || '' }; }
  block.after(nb);
  if (type === 'todo') { const cb = $('.todo-check', nb); if (cb) cb.checked = nb.classList.contains('checked'); }
  refresh(); refreshCommentBadges(); queueSave();
}

function deleteBlock(block) {
  const focusTarget = prevTextBlock(block) || nextTextBlock(block);
  const parent = block.parentElement;
  if (block.dataset.bid) { delete state.comments[block.dataset.bid]; delete state.styles[block.dataset.bid]; }
  // deleting an owned sub-page card flags the page orphaned so it's recoverable;
  // deleting a "/Link to page" reference (data-link) just removes the link — the page stays put
  if (block.dataset.type === 'page' && block.dataset.pageId && block.dataset.link !== '1') orphanPage(block.dataset.pageId);
  block.remove();
  if (parent && parent.classList.contains('col')) {
    // emptying a column removes it; remaining columns shift left (or collapse to normal blocks)
    if (!parent.querySelector(':scope > .block')) pruneColumns(parent.closest('.block[data-type="columns"]'));
  } else if (parent === editor && !editor.querySelector(':scope > .block')) {
    editor.appendChild(newBlockEl('paragraph'));
  }
  if (focusTarget && document.contains(focusTarget)) { const fb = $('.block-body', focusTarget); if (fb) placeCaret(fb, true); }
  refresh(); refreshCommentBadges(); queueSave();
}

// drop empty columns; if only one remains, unwrap the columns block into normal blocks
function pruneColumns(colsBlock) {
  if (!colsBlock) return;
  const wrap = $(':scope > .cols-wrap', colsBlock);
  if (!wrap) return;
  $$(':scope > .col', wrap).forEach((col) => { if (!col.querySelector(':scope > .block')) col.remove(); });
  const cols = $$(':scope > .col', wrap);
  if (cols.length <= 1) {
    const container = colsBlock.parentElement;
    const inner = cols[0] ? Array.from(cols[0].children).filter((c) => c.classList && c.classList.contains('block')) : [];
    if (inner.length) inner.forEach((b) => container.insertBefore(b, colsBlock));
    else container.insertBefore(newBlockEl('paragraph'), colsBlock);
    colsBlock.remove();
  } else {
    colsBlock.dataset.cols = cols.length;
    wrap.style.gridTemplateColumns = `repeat(${cols.length}, 1fr)`;
  }
}

function setBlockColor(block, kind, name) {
  const attr = kind === 'tc' ? 'tc' : 'bg';
  if (!name || name === 'default') delete block.dataset[attr];
  else block.dataset[attr] = name;
  if (block.dataset.tc || block.dataset.bg) {
    const bid = ensureBid(block);
    state.styles[bid] = { tc: block.dataset.tc || '', bg: block.dataset.bg || '' };
  } else if (block.dataset.bid) {
    delete state.styles[block.dataset.bid];
  }
  queueSave();
}

buildBlockMenu();

// click the drag handle to open the menu (drag still reorders)
editor.addEventListener('click', (e) => {
  const handle = e.target.closest('.block-handle');
  if (handle) { e.stopPropagation(); openBlockMenu(handle.closest('.block'), handle); }
});

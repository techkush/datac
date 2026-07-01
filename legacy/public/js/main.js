/* ------------------------------------------------------------------ *
 *  Theme
 * ------------------------------------------------------------------ */
function applyTheme(theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.classList.toggle('light', theme !== 'dark');
  localStorage.setItem('theme', theme);
}
$('#theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(next);
});

/* ------------------------------------------------------------------ *
 *  Collapsible sidebar (auto-hide on narrow windows)
 * ------------------------------------------------------------------ */
const sidebarOpenBtn = $('#sidebar-open');
const NARROW = 820;
let manualCollapsed = false;

function setCollapsed(collapsed) {
  appEl.classList.toggle('sidebar-collapsed', collapsed);
  sidebarOpenBtn.hidden = !collapsed;
}
function applyResponsive() {
  if (window.innerWidth < NARROW) setCollapsed(true);
  else setCollapsed(manualCollapsed);
}
$('#open-folder').addEventListener('click', async () => {
  try { await api.reveal(); } catch (_) {}
});
$('#sidebar-collapse').addEventListener('click', () => { manualCollapsed = true; setCollapsed(true); });
sidebarOpenBtn.addEventListener('click', () => { manualCollapsed = false; setCollapsed(false); });
window.addEventListener('resize', applyResponsive);

/* ------------------------------------------------------------------ *
 *  Wire up + boot
 * ------------------------------------------------------------------ */
$('#new-doc').addEventListener('click', newDoc);
$('#empty-new').addEventListener('click', newDoc);
$('#export-btn').addEventListener('click', () => downloadMarkdown());

editor.addEventListener('blur', () => { if (state.dirty) saveNow(); }, true);

// click the empty area below the content to add / focus a trailing line
docEl.addEventListener('mousedown', (e) => {
  if (e.target.closest('.block, .title-input, .cover, .page-tools, #page-icon, .file-note, .file-open')) return;
  ensureTrailingParagraph();
  const last = editor.lastElementChild;
  if (last && TEXT_TYPES.has(last.dataset.type)) { e.preventDefault(); placeCaret($('.block-body', last), true); }
});
document.addEventListener('mousedown', (e) => {
  if (!slashMenu.contains(e.target)) closeSlash();
  if (!emojiPicker.contains(e.target) && e.target !== addIconBtn && !pageIcon.contains(e.target) && !addIconBtn.contains(e.target)) closeEmojiPicker();
  if (!coverMenu.contains(e.target) && !$('#cover-change').contains(e.target)) closeCoverMenu();
  if (!pageMenu.contains(e.target) && !e.target.closest('.doc-opts')) closePageMenu();
  if (!blockMenu.contains(e.target) && !e.target.closest('.block-handle')) closeBlockMenu();
  if (!statusMenu.contains(e.target) && !statusBtn.contains(e.target)) closeStatusMenu();
  if (!pagePicker.contains(e.target)) closePagePicker();
});

(async function boot() {
  const saved = localStorage.getItem('theme');
  applyTheme(saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  applyResponsive();
  try {
    const info = await api.info();
    if (info && info.title) {
      $('.brand-name').textContent = info.title;
      document.title = info.title + ' — datac';
      if (info.projectDir) $('#open-folder').title = 'Open project folder: ' + info.projectDir;
    }
  } catch (_) {}
  await loadDocs();
  // always open the first (top-level) page so content is visible on every open
  const firstPage = state.docs.find((d) => !d.parent) || state.docs[0];
  if (firstPage) { try { await openDoc(firstPage.id); } catch (e) { console.error('open first page failed', e); } }
})();

// self-heal: if the tab is shown/focused with a workspace but no page open
// (e.g. the OS focused an already-open tab without reloading), open the first page
function ensureFirstPageOpen() {
  if (!state.currentId && state.docs && state.docs.length) {
    const fp = state.docs.find((d) => !d.parent) || state.docs[0];
    if (fp) openDoc(fp.id);
  }
}
window.addEventListener('pageshow', ensureFirstPageOpen);
window.addEventListener('focus', ensureFirstPageOpen);

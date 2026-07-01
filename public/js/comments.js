/* ================================================================== *
 *  Comments — fixed docked panel
 * ================================================================== */
const commentsPanel = $('#comments-panel');
const commentThread = $('#comment-thread');
const commentInput = $('#comment-input');
let commentBid = null;
let commentBlock = null;

function randomId() { return Math.random().toString(36).slice(2, 10); }

// keep these names — they're called from block buttons / openDoc
function openCommentPopover(block) {
  if (!block.dataset.bid) block.dataset.bid = randomId();
  commentBid = block.dataset.bid;
  commentBlock = block;
  renderThread();
  appEl.classList.add('comments-open');
  setTimeout(() => commentInput.focus(), 0);
}
function closeCommentPopover() {
  // drop an empty anchor that never got a comment
  if (commentBlock && (!state.comments[commentBid] || !state.comments[commentBid].length)) {
    delete commentBlock.dataset.bid;
    commentBlock.classList.remove('has-comment');
  }
  appEl.classList.remove('comments-open');
  commentBid = null; commentBlock = null;
}

// render comment body: escape, then linkify [text](url) and bare URLs
function commentHtml(t) {
  let s = escapeHtml(t);
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<)]+)/g, (m, pre, url) => {
    const href = url.startsWith('http') ? url : 'http://' + url;
    return `${pre}<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
  });
  return s.replace(/\n/g, '<br>');
}

function renderThread() {
  const items = state.comments[commentBid] || [];
  commentThread.innerHTML = items.length ? items.map((c, i) => `
    <div class="comment-item">
      <div class="ci-head">
        <span class="ci-who">${escapeHtml(c.by || 'You')}</span>
        <span><span class="ci-time">${fmtTime(c.at)}</span> <button class="ci-del" data-i="${i}" title="Delete">✕</button></span>
      </div>
      <div class="ci-text">${commentHtml(c.text)}</div>
    </div>`).join('') : '<div class="cp-empty">No comments yet on this section. Add one below.</div>';
  $$('.ci-del', commentThread).forEach((b) => b.addEventListener('click', () => {
    if (!confirm('Delete this comment?')) return;
    items.splice(+b.dataset.i, 1);
    if (!items.length) delete state.comments[commentBid];
    renderThread(); refreshCommentBadges(); queueSave();
  }));
}
function fmtTime(iso) {
  try { const d = new Date(iso); return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return ''; }
}
function sendComment() {
  const text = commentInput.value.trim();
  if (!text || !commentBid) return;
  if (!state.comments[commentBid]) state.comments[commentBid] = [];
  state.comments[commentBid].push({ text, at: new Date().toISOString(), by: 'You' });
  commentInput.value = '';
  renderThread(); refreshCommentBadges(); queueSave();
  commentInput.focus();
}
$('#comment-send').addEventListener('click', sendComment);
$('#cp-close').addEventListener('click', closeCommentPopover);
$('#cp-expand').addEventListener('click', () => {
  const wide = commentsPanel.classList.toggle('wide');
  appEl.classList.toggle('comments-wide', wide);
});
$('#comment-link').addEventListener('click', () => {
  const url = prompt('Link URL:');
  if (!url) return;
  const label = prompt('Link text (optional):', url) || url;
  const snippet = `[${label}](${url}) `;
  const i = commentInput.selectionStart ?? commentInput.value.length;
  commentInput.value = commentInput.value.slice(0, i) + snippet + commentInput.value.slice(i);
  commentInput.focus();
});
commentInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendComment(); }
  if (e.key === 'Escape') { e.preventDefault(); closeCommentPopover(); }
});

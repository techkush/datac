/* ================================================================== *
 *  Page head: icon (emoji) + cover image
 * ================================================================== */
const docEl = $('#doc');
const coverEl = $('#cover');
const coverFill = $('#cover-fill');
const pageIcon = $('#page-icon');
const pageTools = $('#page-tools');
const addIconBtn = $('#add-icon-btn');
const addCoverBtn = $('#add-cover-btn');

const COVERS = [
  'linear-gradient(135deg,#667eea,#764ba2)',
  'linear-gradient(135deg,#f093fb,#f5576c)',
  'linear-gradient(135deg,#4facfe,#00f2fe)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#fa709a,#fee140)',
  'linear-gradient(135deg,#30cfd0,#330867)',
  'linear-gradient(135deg,#a8edea,#fed6e3)',
  'linear-gradient(135deg,#ff9a9e,#fecfef)',
  'linear-gradient(135deg,#0f2027,#2c5364)',
  'linear-gradient(135deg,#f7971e,#ffd200)',
  'linear-gradient(135deg,#c471f5,#fa71cd)',
  'linear-gradient(135deg,#1e3c72,#2a5298)',
];
const EMOJIS = ['📄','📝','📌','📒','📓','📔','📕','📗','📘','📙','📚','🗒️','🗓️','📅','✅','⭐','🔥','💡','🚀','🎯','🎨','🧠','💼','📈','📊','🔬','🧪','⚙️','🛠️','🔖','🏷️','📎','✏️','🖊️','🗂️','📁','🔑','🔒','🌟','❤️','😀','😎','🤔','🙌','👍','🎉','☕','🌈','🌍','🏆','🧩','💬','📣','⏰','🗺️','💎','🪄','🧭','🦄','🍀','🌸','⚡','🎵','📷'];

function applyCover(val) {
  if (!val) return;
  if (val.startsWith('grad:')) coverFill.style.background = COVERS[+val.slice(5)] || COVERS[0];
  else coverFill.style.background = `#222 url("${val}") center/cover no-repeat`;
}
function renderHead() {
  if (state.icon) { pageIcon.hidden = false; pageIcon.textContent = state.icon; addIconBtn.hidden = true; }
  else { pageIcon.hidden = true; pageIcon.textContent = ''; addIconBtn.hidden = false; }
  if (state.cover) { coverEl.hidden = false; docEl.classList.add('has-cover'); applyCover(state.cover); addCoverBtn.hidden = true; }
  else { coverEl.hidden = true; docEl.classList.remove('has-cover'); addCoverBtn.hidden = false; }
}
function setIcon(emoji) { state.icon = emoji; renderHead(); queueSave(); }
function setCover(val) { state.cover = val; renderHead(); queueSave(); }

/* ---- emoji picker ---- */
const emojiPicker = $('#emoji-picker');
(function buildEmojiGrid() {
  $('#emoji-grid').innerHTML = EMOJIS.map((e) => `<button type="button">${e}</button>`).join('');
  $('#emoji-grid').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    setIcon(b.textContent); closeEmojiPicker();
  });
  $('#emoji-random').addEventListener('click', () => { setIcon(EMOJIS[Math.floor(Math.random() * EMOJIS.length)]); closeEmojiPicker(); });
  $('#emoji-remove').addEventListener('click', () => { setIcon(''); closeEmojiPicker(); });
})();
function openEmojiPicker(anchor) {
  const r = anchor.getBoundingClientRect();
  emojiPicker.hidden = false;
  emojiPicker.style.top = (r.bottom + window.scrollY + 6) + 'px';
  emojiPicker.style.left = Math.min(r.left + window.scrollX, window.innerWidth - 312) + 'px';
}
function closeEmojiPicker() { emojiPicker.hidden = true; }
addIconBtn.addEventListener('click', (e) => { e.stopPropagation(); openEmojiPicker(addIconBtn); });
pageIcon.addEventListener('click', (e) => { e.stopPropagation(); openEmojiPicker(pageIcon); });

/* ---- cover menu ---- */
const coverMenu = $('#cover-menu');
(function buildCoverSwatches() {
  $('#cover-swatches').innerHTML = COVERS.map((c, i) => `<button type="button" data-i="${i}" style="background:${c}"></button>`).join('');
  $('#cover-swatches').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    setCover('grad:' + b.dataset.i); closeCoverMenu();
  });
  $('#cover-upload').addEventListener('click', () => { pendingCover = true; filePicker.accept = 'image/*'; filePicker.click(); closeCoverMenu(); });
})();
function openCoverMenu(anchor) {
  const r = anchor.getBoundingClientRect();
  coverMenu.hidden = false;
  coverMenu.style.top = (r.bottom + window.scrollY + 6) + 'px';
  coverMenu.style.left = Math.min(r.left + window.scrollX, window.innerWidth - 252) + 'px';
}
function closeCoverMenu() { coverMenu.hidden = true; }
addCoverBtn.addEventListener('click', (e) => { e.stopPropagation(); setCover('grad:' + Math.floor(Math.random() * COVERS.length)); });
$('#cover-change').addEventListener('click', (e) => { e.stopPropagation(); openCoverMenu($('#cover-change')); });
$('#cover-remove').addEventListener('click', (e) => { e.stopPropagation(); setCover(''); });

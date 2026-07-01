'use strict';

/* ================================================================== *
 *  Notion-style block editor — front-end
 * ================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const appEl = $('#app');
const editor = $('#editor');
const titleInput = $('#title');
const docList = $('#doc-list');
const slashMenu = $('#slash-menu');
const inlineToolbar = $('#inline-toolbar');
const filePicker = $('#file-picker');
const saveStatus = $('#save-status');

let state = {
  currentId: null,
  docs: [],
  dirty: false,
  saving: false,
  icon: '',
  cover: '',
  parent: '',     // parent page id (for sub-pages)
  status: '',     // page status key (not-started/writing/reviewing/revising/done)
  comments: {},   // { blockId: [ {text, at, by} ] }
  styles: {},     // { blockId: {tc, bg} }
};

/* ------------------------------------------------------------------ *
 *  API  (scoped to the current workspace -> /w/<id>)
 * ------------------------------------------------------------------ */
const WS = (location.pathname.match(/^\/w\/([^/]+)/) || [])[1] || '';
const API = `/api/w/${WS}`;
const api = {
  info: () => fetch(`${API}/info`).then((r) => r.json()),
  list: () => fetch(`${API}/docs`).then((r) => r.json()),
  get: (id) => fetch(`${API}/docs/` + id).then((r) => r.json()),
  create: (fields = { title: 'Untitled', blocks: [] }) => fetch(`${API}/docs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) }).then((r) => r.json()),
  save: (id, fields, keepalive = false) =>
    fetch(`${API}/docs/` + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields), keepalive }).then((r) => r.json()),
  remove: (id) => fetch(`${API}/docs/` + id, { method: 'DELETE' }).then((r) => r.json()),
  upload: (name, dataUrl) =>
    fetch(`${API}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, dataUrl }) }).then((r) => r.json()),
  reveal: () => fetch(`${API}/reveal`, { method: 'POST' }).then((r) => r.json()),
  pickFile: () => fetch(`${API}/pick-file`, { method: 'POST' }).then((r) => r.json()),
  openFile: (p) => fetch(`${API}/open-file`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) }).then((r) => r.json()),
};

/* ------------------------------------------------------------------ *
 *  Block-type catalogue (used by slash menu)
 * ------------------------------------------------------------------ */
const BLOCK_TYPES = [
  { type: 'paragraph', label: 'Text', desc: 'Plain paragraph', icon: '¶', keys: 'text paragraph' },
  { type: 'page', label: 'Page', desc: 'A new sub-page inside this page', icon: '📄', keys: 'page subpage child nested inside new', action: 'page' },
  { type: 'pagelink', label: 'Link to page', desc: 'Link to an existing page', icon: '🔗', keys: 'link page existing reference navigate goto mention', action: 'pagelink' },
  { type: 'h1', label: 'Heading 1', desc: 'Large section heading', icon: 'H₁', keys: 'h1 title heading' },
  { type: 'h2', label: 'Heading 2', desc: 'Medium heading', icon: 'H₂', keys: 'h2 heading' },
  { type: 'h3', label: 'Heading 3', desc: 'Small heading', icon: 'H₃', keys: 'h3 heading' },
  { type: 'h4', label: 'Heading 4', desc: 'Smallest heading', icon: 'H₄', keys: 'h4 heading' },
  { type: 'bulleted', label: 'Bulleted list', desc: 'Simple bullet list', icon: '•', keys: 'bullet unordered list ul' },
  { type: 'numbered', label: 'Numbered list', desc: 'Ordered list', icon: '1.', keys: 'number ordered list ol' },
  { type: 'todo', label: 'To-do list', desc: 'Checkbox to track tasks', icon: '☑', keys: 'todo check task box' },
  { type: 'quote', label: 'Quote', desc: 'Capture a quotation', icon: '❝', keys: 'quote blockquote' },
  { type: 'code', label: 'Code', desc: 'Code block', icon: '</>', keys: 'code snippet pre' },
  { type: 'math', label: 'Math / Equation', desc: 'Paste & correct math (LaTeX)', icon: '∑', keys: 'math equation formula latex tex katex correct paste', action: 'math' },
  { type: 'divider', label: 'Divider', desc: 'Horizontal rule', icon: '—', keys: 'divider hr line rule', action: 'divider' },
  { type: 'image', label: 'Image', desc: 'Upload a picture', icon: '🖼', keys: 'image picture photo figure', action: 'image' },
  { type: 'file', label: 'File', desc: 'Upload a file into dataC', icon: '📎', keys: 'file attachment document upload', action: 'file' },
  { type: 'linkfile', label: 'File link', desc: 'Link a file by path (no copy)', icon: '🔗', keys: 'link file path reference local open external', action: 'linkfile' },
  { type: 'columns2', label: '2 columns', desc: 'Divide into two columns', icon: '▥', keys: 'columns 2 two layout grid side', action: 'columns', n: 2 },
  { type: 'columns3', label: '3 columns', desc: 'Divide into three columns', icon: '▥', keys: 'columns 3 three layout grid side', action: 'columns', n: 3 },
  { type: 'columns4', label: '4 columns', desc: 'Divide into four columns', icon: '▥', keys: 'columns 4 four layout grid side', action: 'columns', n: 4 },
];
const TEXT_TYPES = new Set(['paragraph', 'h1', 'h2', 'h3', 'h4', 'bulleted', 'numbered', 'todo', 'quote']);

const PLACEHOLDERS = {
  paragraph: "Write something, or press '/' for commands",
  h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', h4: 'Heading 4',
  bulleted: 'List', numbered: 'List', todo: 'To-do',
  quote: 'Quote', code: 'Code',
};

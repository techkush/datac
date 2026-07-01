#!/usr/bin/env node
'use strict';

/*
 * datac — system-wide CLI for the Notion-style local notes app.
 *
 *   datac init [title]   create dataC/ + open.dc in the current folder,
 *                        register it, start the daemon, open it in the browser
 *   datac open [path]    open an existing workspace (folder or open.dc) in the browser
 *   datac list           list all registered workspaces
 *   datac start|stop|status|restart   manage the always-running daemon
 *   datac help
 */

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const APP_DIR = path.join(__dirname, '..');
const SERVER = path.join(APP_DIR, 'server.js');
const DATAC_HOME = process.env.DATAC_HOME || path.join(os.homedir(), '.datac');
const REGISTRY = path.join(DATAC_HOME, 'workspaces.json');
const DAEMON_FILE = path.join(DATAC_HOME, 'daemon.json');
const LOG_FILE = path.join(DATAC_HOME, 'daemon.log');
const PORT = Number(process.env.DATAC_PORT || 4321);
const BASE = `http://127.0.0.1:${PORT}`;

/* ---- small utils ------------------------------------------------------- */
const C = { dim: (s) => `\x1b[2m${s}\x1b[0m`, green: (s) => `\x1b[32m${s}\x1b[0m`, bold: (s) => `\x1b[1m${s}\x1b[0m`, red: (s) => `\x1b[31m${s}\x1b[0m`, cyan: (s) => `\x1b[36m${s}\x1b[0m` };
function ensureHome() { fs.mkdirSync(DATAC_HOME, { recursive: true }); }
function readJSON(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function writeJSON(file, obj) { fs.writeFileSync(file, JSON.stringify(obj, null, 2)); }
function nowISO() { return new Date().toISOString(); }

function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}/api/workspaces`, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => { req.destroy(); resolve(false); });
  });
}

async function daemonRunning() {
  if (await ping()) return true;
  const info = readJSON(DAEMON_FILE, null);
  if (info && info.pid) { try { process.kill(info.pid, 0); return await ping(); } catch (_) {} }
  return false;
}

async function startDaemon() {
  if (await daemonRunning()) return true;
  ensureHome();
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [SERVER], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, DATAC_HOME, DATAC_PORT: String(PORT) },
  });
  child.unref();
  writeJSON(DAEMON_FILE, { pid: child.pid, port: PORT, started: nowISO() });
  // wait for it to come up
  for (let i = 0; i < 50; i++) {
    if (await ping()) return true;
    await sleep(100);
  }
  return await ping();
}

function stopDaemon() {
  const info = readJSON(DAEMON_FILE, null);
  if (info && info.pid) {
    try { process.kill(info.pid); console.log(C.green('✓'), 'daemon stopped'); }
    catch (_) { console.log(C.dim('daemon was not running')); }
  } else console.log(C.dim('daemon was not running'));
  try { fs.unlinkSync(DAEMON_FILE); } catch (_) {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Give a file a custom Finder icon (macOS). Best-effort, silent on failure.
function setFileIcon(filePath) {
  if (process.platform !== 'darwin') return;
  const icns = path.join(APP_DIR, 'assets', 'dc-doc.icns');
  if (!fs.existsSync(icns)) return;
  const jxa = `ObjC.import('AppKit');var i=$.NSImage.alloc.initWithContentsOfFile(${JSON.stringify(icns)});$.NSWorkspace.sharedWorkspace.setIconForFileOptions(i,${JSON.stringify(filePath)},0);`;
  try { execFile('osascript', ['-l', 'JavaScript', '-e', jxa], () => {}); } catch (_) {}
}

function openInBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url];
  execFile(cmd, args, () => {});
}

/* ---- workspace registry ------------------------------------------------ */
function loadRegistry() { ensureHome(); return readJSON(REGISTRY, {}); }
function saveRegistry(reg) { ensureHome(); writeJSON(REGISTRY, reg); }

function findExistingId(reg, dataDir) {
  for (const [id, w] of Object.entries(reg)) if (w.dataDir === dataDir) return id;
  return null;
}

function hasNotes(dataDir) {
  try { return fs.readdirSync(dataDir).some((f) => f.endsWith('.md')); }
  catch (_) { return false; }
}

function welcomeMarkdown(title) {
  return [
    `# Welcome to ${title} 👋`,
    '',
    'This is your local notes workspace. Everything you write is **autosaved** as Markdown',
    `inside this project's \`dataC/\` folder — no accounts, no cloud.`,
    '',
    '## Quick start',
    '',
    "- Press `/` on an empty line to open the **block menu**",
    '- Type Markdown shortcuts then space: `#` heading, `-` bullet, `1.` list, `[]` to-do, `>` quote',
    '- Select text for **bold** / *italic* / `code`, or use `Cmd/Ctrl+B`, `+I`, `+U`',
    '- Drag the `⋮⋮` handle on the left of a block to reorder it',
    '',
    '## Try the blocks',
    '',
    '- [x] Open this welcome note',
    '- [ ] Write your first real note',
    '- [ ] Paste or insert an image (it saves to `dataC/files/`)',
    '',
    '> Tip: hit `Cmd/Ctrl+S` any time to force a save — though it saves on its own as you type.',
    '',
    '```',
    'datac open    # reopen this workspace later from its folder',
    '```',
    '',
    '---',
    '',
    'Delete this page whenever you like, and make it yours. ✨',
    '',
  ].join('\n');
}

function seedWelcomeNote(dataDir, title) {
  if (hasNotes(dataDir)) return false;
  const id = crypto.randomBytes(8).toString('hex');
  const now = nowISO();
  const fm = ['---', `title: ${JSON.stringify('Welcome')}`, `created: ${now}`, `updated: ${now}`, '---', ''].join('\n');
  fs.writeFileSync(path.join(dataDir, id + '.md'), fm + welcomeMarkdown(title));
  return true;
}

/* ---- commands ---------------------------------------------------------- */
async function cmdInit(args) {
  const cwd = process.cwd();
  const title = (args.join(' ').trim()) || path.basename(cwd) || 'Untitled';

  const dataDir = path.join(cwd, 'dataC');
  const filesDir = path.join(dataDir, 'files');
  await fsp.mkdir(filesDir, { recursive: true });

  const reg = loadRegistry();
  let id = findExistingId(reg, dataDir) || crypto.randomBytes(8).toString('hex');
  const url = `${BASE}/w/${id}`;

  reg[id] = {
    id, title,
    projectDir: cwd,
    dataDir,
    created: reg[id] ? reg[id].created : nowISO(),
    opened: nowISO(),
  };
  saveRegistry(reg);

  // open.dc manifest — open this in the browser via `datac open`
  const manifest = { app: 'datac', id, title, projectDir: cwd, dataDir, url, opened: nowISO() };
  const dcPath = path.join(cwd, 'open.dc');
  await fsp.writeFile(dcPath, JSON.stringify(manifest, null, 2) + '\n');
  setFileIcon(dcPath);

  // seed a welcome note the first time a workspace is created
  const seeded = seedWelcomeNote(dataDir, title);

  console.log(C.green('✓'), `workspace ${C.bold(title)} ready`);
  if (seeded) console.log('  ' + C.dim('added  ') + 'a Welcome note');
  console.log('  ' + C.dim('notes  ') + path.relative(cwd, dataDir) + '/');
  console.log('  ' + C.dim('manifest ') + 'open.dc');

  if (!(await startDaemon())) { console.error(C.red('✗'), 'could not start the datac daemon'); process.exit(1); }
  console.log('  ' + C.dim('opening ') + C.cyan(url));
  openInBrowser(url);
}

/* ---- setup: scaffold a workspace from a pipeline template -------------- */
const SETUP_TEMPLATES = {
  research: {
    title: 'PhD Research Pipeline', icon: '🎓', cover: 'grad:0',
    intro: 'Search → Read & Listen → Code & Test → Write — an end-to-end workflow.',
    phases: [
      { title: '1 · Searching', icon: '🔍', steps: [
        'Abstract the topic — distil the research question into a focused query.',
        'Get search results via Perplexity.',
        'Deep research via Gemini.',
        'Create a PDF of the compiled findings.',
        'Send to iPad for offline review.',
      ] },
      { title: '2 · Reading & Listening', icon: '🎧', steps: [
        'Create a Notebook in NotebookLM — Audio (Sinhala & English), Flashcards, Mindmap, Infographics, Brief Document.',
        'Listen to audio reviews while working.',
        'Read full deep-research documents.',
        'Highlight key points & papers needing deeper reading.',
        'Download & read papers — collect the semantic idea and how they did the POC.',
      ] },
      { title: '3 · Coding & Testing', icon: '⚙️', steps: [
        'Plan the experimental idea.',
        'Prompting — design and refine prompts.',
        'Coding — implement the experiment.',
        'Testing — validate the implementation.',
        'Generate proper results.',
      ] },
      { title: '4 · Writing', icon: '✍️', steps: [
        'Methodology & Results — write briefly, read & brief the document, then revise.',
        'Introduction & Related Works — write briefly, read & brief the document, then revise.',
        'Conclusion & Abstract — write, then read & revise the full document.',
        'Send to supervisor to get feedback.',
      ] },
    ],
  },
  mobileapp: {
    title: 'Mobile App Development Pipeline', icon: '📱', cover: 'grad:2',
    intro: 'Plan → Prompt → Code & Test → Deploy — an end-to-end workflow.',
    phases: [
      { title: '1 · Planning', icon: '🧭', steps: [
        'Open the document to start capturing the plan.',
        'Write down the ideas for the app.',
        'List key features & functions.',
        'Select the frameworks to build with.',
      ] },
      { title: '2 · Prompting', icon: '💬', steps: [
        'List the essential prompts for Claude in the document.',
      ] },
      { title: '3 · Coding & Testing', icon: '⚙️', steps: [
        'Code one prompt at a time.',
        'Test with a real device.',
      ] },
      { title: '4 · Deploying', icon: '🚀', steps: [
        'Check for security issues before release.',
        'Deploy to the App Store — test version.',
        'Deploy to the Play Store — test version.',
      ] },
    ],
  },
};

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

// build the page docs (root + one sub-page per phase) for a template
function buildTemplateDocs(tpl) {
  const now = nowISO();
  let seq = 0;
  const bid = () => 'b' + (seq++).toString(36) + crypto.randomBytes(2).toString('hex');
  const rootId = crypto.randomBytes(8).toString('hex');
  const docs = [];
  const links = [];

  tpl.phases.forEach((ph) => {
    const cid = crypto.randomBytes(8).toString('hex');
    const blocks = [
      { id: bid(), type: 'h2', html: esc(ph.title) },
      ...ph.steps.map((s) => ({ id: bid(), type: 'todo', html: esc(s) })),
    ];
    docs.push({ id: cid, doc: {
      title: ph.title, icon: ph.icon || '📄', cover: '', parent: rootId, orphaned: false, status: 'not-started',
      created: now, updated: now, blocks, comments: {},
    } });
    links.push({ id: bid(), type: 'page', pageId: cid, note: '' });
  });

  const rootBlocks = [
    { id: bid(), type: 'paragraph', html: esc(tpl.intro) },
    { id: bid(), type: 'divider' },
    { id: bid(), type: 'h3', html: 'Phases' },
    ...links,
  ];
  docs.unshift({ id: rootId, doc: {
    title: tpl.title, icon: tpl.icon, cover: tpl.cover || '', parent: '', orphaned: false, status: 'not-started',
    created: now, updated: now, blocks: rootBlocks, comments: {},
  } });

  return { rootId, docs };
}

async function cmdSetup(args) {
  const key = (args[0] || '').toLowerCase();
  const tpl = SETUP_TEMPLATES[key];
  if (!tpl) {
    console.error(C.red('✗'), 'unknown template.');
    console.error('  usage:', C.bold('datac setup [research|mobileapp]'));
    process.exit(1);
  }
  const cwd = process.cwd();
  const dataDir = path.join(cwd, 'dataC');
  await fsp.mkdir(path.join(dataDir, 'files'), { recursive: true });

  // register workspace
  const reg = loadRegistry();
  const id = findExistingId(reg, dataDir) || crypto.randomBytes(8).toString('hex');
  const url = `${BASE}/w/${id}`;
  reg[id] = { id, title: tpl.title, projectDir: cwd, dataDir, created: reg[id] ? reg[id].created : nowISO(), opened: nowISO() };
  saveRegistry(reg);

  // open.dc manifest
  const dcPath = path.join(cwd, 'open.dc');
  await fsp.writeFile(dcPath, JSON.stringify({ app: 'datac', id, title: tpl.title, projectDir: cwd, dataDir, url, opened: nowISO() }, null, 2) + '\n');
  setFileIcon(dcPath);

  // write the pages — only if this workspace has none yet (never overwrite existing notes)
  const hasDocs = fs.readdirSync(dataDir).some((f) => f.endsWith('.json') || f.endsWith('.md'));
  if (hasDocs) {
    console.log('  ' + C.dim('workspace already has pages — leaving them as-is.'));
  } else {
    const { docs } = buildTemplateDocs(tpl);
    for (const { id: did, doc } of docs) fs.writeFileSync(path.join(dataDir, did + '.json'), JSON.stringify(doc, null, 2));
    console.log(C.green('✓'), `created ${C.bold(docs.length + ' pages')} for ${C.bold(tpl.title)}`);
    tpl.phases.forEach((ph) => console.log('  ' + C.dim('  •') + ' ' + ph.title));
  }

  console.log(C.green('✓'), `workspace ${C.bold(tpl.title)} ready`);
  console.log('  ' + C.dim('notes  ') + path.relative(cwd, dataDir) + '/');
  if (!(await startDaemon())) { console.error(C.red('✗'), 'could not start the datac daemon'); process.exit(1); }
  console.log('  ' + C.dim('opening ') + C.cyan(url));
  openInBrowser(url);
}

async function cmdOpen(args) {
  let target = args[0] ? path.resolve(args[0]) : process.cwd();
  // accept a folder or a path to an open.dc
  let manifestPath;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) manifestPath = path.join(target, 'open.dc');
  else manifestPath = target;

  if (!fs.existsSync(manifestPath)) {
    console.error(C.red('✗'), `no open.dc found at ${manifestPath}`);
    console.error('  run', C.bold('datac init'), 'in the project folder first.');
    process.exit(1);
  }
  const manifest = readJSON(manifestPath, null);
  if (!manifest || !manifest.id) { console.error(C.red('✗'), 'open.dc is not a valid datac manifest'); process.exit(1); }
  setFileIcon(manifestPath);

  // make sure the workspace is registered (re-register if registry was cleared)
  const reg = loadRegistry();
  if (!reg[manifest.id]) {
    reg[manifest.id] = { id: manifest.id, title: manifest.title, projectDir: manifest.projectDir, dataDir: manifest.dataDir, created: manifest.opened || nowISO(), opened: nowISO() };
  } else { reg[manifest.id].opened = nowISO(); }
  saveRegistry(reg);

  if (!(await startDaemon())) { console.error(C.red('✗'), 'could not start the datac daemon'); process.exit(1); }
  const url = `${BASE}/w/${manifest.id}`;
  console.log(C.green('✓'), 'opening', C.bold(manifest.title || 'workspace'), C.dim(url));
  openInBrowser(url);
}

function cmdList() {
  const reg = loadRegistry();
  const rows = Object.values(reg).sort((a, b) => String(b.opened || '').localeCompare(String(a.opened || '')));
  if (!rows.length) { console.log(C.dim('No workspaces. Run `datac init` in a project folder.')); return; }
  console.log(C.bold('Workspaces:'));
  for (const w of rows) console.log(`  ${C.cyan(w.title || 'Untitled').padEnd(28)} ${C.dim(w.projectDir)}\n  ${C.dim('  ' + BASE + '/w/' + w.id)}`);
}

async function cmdStatus() {
  const running = await daemonRunning();
  const info = readJSON(DAEMON_FILE, null);
  console.log('daemon:', running ? C.green('running') : C.red('stopped'), info ? C.dim(`(pid ${info.pid}, port ${info.port})`) : '');
  console.log('home:  ', C.dim(DATAC_HOME));
  if (running) console.log('open:  ', C.cyan(BASE));
}

async function cmdFinderInstall() {
  if (process.platform !== 'darwin') {
    console.log('finder-install currently supports macOS only. On other systems use `datac open <path>`.');
    return;
  }
  const { execFileSync } = require('child_process');
  const appPath = path.join(os.homedir(), 'Applications', 'DataC.app');
  const cliScript = path.join(__dirname, 'datac.js');
  const node = process.execPath;
  const script =
    'on open theFiles\n' +
    '  repeat with f in theFiles\n' +
    '    set p to POSIX path of f\n' +
    `    do shell script ${JSON.stringify(`'${node}' '${cliScript}' open `)} & quoted form of p\n` +
    '  end repeat\n' +
    'end open\n' +
    'on run\n' +
    `  do shell script ${JSON.stringify(`'${node}' '${cliScript}' open`)}\n` +
    'end run\n';

  ensureHome();
  const scptPath = path.join(DATAC_HOME, 'opener.applescript');
  fs.writeFileSync(scptPath, script);
  fs.mkdirSync(path.join(os.homedir(), 'Applications'), { recursive: true });
  fs.rmSync(appPath, { recursive: true, force: true });
  execFileSync('osacompile', ['-o', appPath, scptPath], { stdio: 'ignore' });

  // Install the document icon into the app bundle
  // Two icons: gray dc-app.icns for the APPLICATION, colorful dc-doc.icns for the .dc DOCUMENT.
  const resDir = path.join(appPath, 'Contents', 'Resources');
  const docIcns = path.join(APP_DIR, 'assets', 'dc-doc.icns');
  const appIcns = path.join(APP_DIR, 'assets', 'dc-app.icns');
  let hasIcon = false, hasAppIcon = false;
  try {
    fs.mkdirSync(resDir, { recursive: true });
    if (fs.existsSync(docIcns)) { fs.copyFileSync(docIcns, path.join(resDir, 'dc-doc.icns')); hasIcon = true; }
    if (fs.existsSync(appIcns)) { fs.copyFileSync(appIcns, path.join(resDir, 'dc-app.icns')); hasAppIcon = true; }
  } catch (_) {}

  const PB = '/usr/libexec/PlistBuddy';
  const PL = path.join(appPath, 'Contents', 'Info.plist');
  const pb = (cmd) => { try { execFileSync(PB, ['-c', cmd, PL], { stdio: 'ignore' }); } catch (_) {} };
  pb('Add :CFBundleIdentifier string com.datac.opener');
  pb('Set :CFBundleIdentifier com.datac.opener');
  pb('Add :CFBundleName string DataC');
  const appIconName = hasAppIcon ? 'dc-app' : (hasIcon ? 'dc-doc' : '');
  if (appIconName) { pb(`Add :CFBundleIconFile string ${appIconName}`); pb(`Set :CFBundleIconFile ${appIconName}`); }
  pb('Add :CFBundleDocumentTypes array');
  pb('Add :CFBundleDocumentTypes:0 dict');
  pb("Add :CFBundleDocumentTypes:0:CFBundleTypeName string 'DataC Workspace'");
  pb('Add :CFBundleDocumentTypes:0:CFBundleTypeRole string Editor');
  pb('Add :CFBundleDocumentTypes:0:LSHandlerRank string Owner');
  if (hasIcon) pb('Add :CFBundleDocumentTypes:0:CFBundleTypeIconFile string dc-doc.icns');
  pb('Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions array');
  pb('Add :CFBundleDocumentTypes:0:CFBundleTypeExtensions:0 string dc');

  // bump bundle mtime so LaunchServices/Finder refresh the icon
  try { const now = new Date(); fs.utimesSync(appPath, now, now); } catch (_) {}

  const LSREG = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  try { execFileSync(LSREG, ['-f', appPath], { stdio: 'ignore' }); } catch (_) {}

  let setDefault = false;
  try { execFileSync('duti', ['-s', 'com.datac.opener', 'dc', 'all'], { stdio: 'ignore' }); setDefault = true; } catch (_) {}

  console.log(C.green('✓'), 'installed', C.bold('DataC.app'), C.dim('(' + appPath + ')'));
  if (hasIcon) console.log('  ✓ custom icon set for', C.bold('.dc'), 'files');
  if (setDefault) {
    console.log('  ✓ .dc files now open in your browser on double-click.');
    console.log(C.dim('  (if icons don\'t refresh: run `killall Finder`)'));
  } else {
    console.log('  One-time step to enable double-click:');
    console.log('    right-click any ' + C.bold('open.dc') + ' → ' + C.bold('Get Info'));
    console.log('    under ' + C.bold('Open with') + ' choose ' + C.bold('DataC') + ' → click ' + C.bold('Change All…'));
    console.log(C.dim('  (or install `duti` and re-run: brew install duti)'));
  }
}

function help() {
  console.log(`${C.bold('datac')} — local Notion-style notes

${C.bold('Usage')}
  datac init [title]     Create dataC/ + open.dc here, start the app, open in browser
  datac setup <template> Scaffold a workspace from a template: research | mobileapp
  datac open [path]      Open a workspace (folder or open.dc) in the browser
  datac list             List registered workspaces
  datac start            Start the always-running daemon
  datac stop             Stop the daemon
  datac restart          Restart the daemon
  datac status           Show daemon status
  datac finder-install   (macOS) make double-clicking open.dc open it in the browser
  datac help             Show this help

${C.bold('Example')}
  cd ~/projects/project_01
  datac init "Project 01"     ${C.dim('# creates ./dataC and ./open.dc, opens notes')}
  datac open                  ${C.dim('# reopen this folder\'s notes later')}
`);
}

/* ---- dispatch ---------------------------------------------------------- */
(async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    switch (cmd) {
      case 'init': await cmdInit(args); break;
      case 'setup': await cmdSetup(args); break;
      case 'open': await cmdOpen(args); break;
      case 'list': case 'ls': cmdList(); break;
      case 'start': await startDaemon().then((ok) => console.log(ok ? C.green('✓ daemon running ') + C.cyan(BASE) : C.red('✗ failed to start'))); break;
      case 'stop': stopDaemon(); break;
      case 'restart': stopDaemon(); await sleep(300); await startDaemon().then((ok) => console.log(ok ? C.green('✓ restarted') : C.red('✗ failed'))); break;
      case 'status': await cmdStatus(); break;
      case 'finder-install': await cmdFinderInstall(); break;
      case 'help': case '--help': case '-h': case undefined: help(); break;
      default: console.error(C.red(`unknown command: ${cmd}`)); help(); process.exit(1);
    }
  } catch (err) {
    console.error(C.red('✗'), err.message || err);
    process.exit(1);
  }
})();

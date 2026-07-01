'use strict';

/*
 * datac daemon — an always-running local server that serves the
 * Notion-style editor for MANY workspaces at once.
 *
 * Each workspace is a project folder on disk that contains:
 *   <project>/dataC/          -> markdown notes (<docId>.md) for that project
 *   <project>/dataC/files/    -> uploaded images / attachments
 *   <project>/open.dc         -> manifest pointing back to this workspace
 *
 * The daemon keeps no per-project state of its own; it reads the global
 * registry (~/.datac/workspaces.json) which the `datac` CLI maintains.
 */

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const APP_DIR = __dirname;
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const DATAC_HOME = process.env.DATAC_HOME || path.join(os.homedir(), '.datac');
const REGISTRY = path.join(DATAC_HOME, 'workspaces.json');
const PORT = process.env.DATAC_PORT || process.env.PORT || 4321;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
};

/* ---- helpers ----------------------------------------------------------- */
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function sendJSON(res, status, obj) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}
function readBody(req, limit = 80 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('payload too large')); req.destroy(); return; } chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readRegistry() {
  try { return JSON.parse(await fsp.readFile(REGISTRY, 'utf8')); }
  catch (_) { return {}; }
}
async function workspaceDir(id) {
  const reg = await readRegistry();
  const ws = reg[id];
  if (!ws) return null;
  return ws.dataDir;
}

// remove a workspace: delete its dataC data + open.dc + registry entry.
// only remove the project folder itself if it is left completely empty.
async function deleteWorkspace(id) {
  const reg = await readRegistry();
  const w = reg[id];
  if (!w) return false;
  if (w.dataDir) { try { await fsp.rm(w.dataDir, { recursive: true, force: true }); } catch (_) {} }
  if (w.projectDir) {
    try { await fsp.unlink(path.join(w.projectDir, 'open.dc')); } catch (_) {}
    try { const rest = await fsp.readdir(w.projectDir); if (!rest.length) await fsp.rmdir(w.projectDir); } catch (_) {}
  }
  delete reg[id];
  try { await fsp.writeFile(REGISTRY, JSON.stringify(reg, null, 2)); } catch (_) {}
  return true;
}

/* ---- frontmatter ------------------------------------------------------- */
function parseDoc(raw) {
  const meta = { title: 'Untitled', updated: null, created: null };
  let body = raw;
  if (raw.startsWith('---')) {
    const end = raw.indexOf('\n---', 3);
    if (end !== -1) {
      const fm = raw.slice(3, end).trim();
      body = raw.slice(end + 4).replace(/^\r?\n/, '');
      for (const line of fm.split('\n')) {
        const m = line.match(/^(\w+):\s*(.*)$/);
        if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return { meta, body };
}
const safeId = (id) => (/^[a-zA-Z0-9_-]+$/.test(id) ? id : null);
function safeParse(s, fallback) { try { return JSON.parse(s); } catch (_) { return fallback; } }

// ordered list of child page ids as they appear in a doc's block flow (incl. columns)
function collectPageIds(blocks, out) {
  for (const b of blocks || []) {
    if (b.type === 'page' && b.pageId) out.push(b.pageId);
    else if (b.type === 'columns' && Array.isArray(b.cols)) b.cols.forEach((col) => collectPageIds(col, out));
  }
}

/* ---- document ops (scoped to a dataDir) --------------------------------
 * Canonical store is <id>.json (a block-tree document). Legacy <id>.md
 * files are still read and reported, then migrated to JSON on first save. */
async function listDocs(dataDir) {
  let entries = [];
  try { entries = await fsp.readdir(dataDir); } catch (_) { return []; }
  const byId = {};
  for (const name of entries) {
    let id, isJson;
    if (name.endsWith('.json')) { id = name.slice(0, -5); isJson = true; }
    else if (name.endsWith('.md')) { id = name.slice(0, -3); isJson = false; }
    else continue;
    if (byId[id] && byId[id]._json) continue;     // a .json wins over a legacy .md
    try {
      const raw = await fsp.readFile(path.join(dataDir, name), 'utf8');
      let title, icon, updated, created, parent = '', orphaned = false, childOrder = [], status = '';
      if (isJson) { const d = JSON.parse(raw); title = d.title; icon = d.icon; updated = d.updated; created = d.created; parent = d.parent || ''; orphaned = !!d.orphaned; status = d.status || ''; collectPageIds(d.blocks, childOrder); }
      else { const { meta } = parseDoc(raw); title = meta.title; icon = meta.icon; updated = meta.updated; created = meta.created; }
      byId[id] = { id, title: title || 'Untitled', icon: icon || '', updated, created, parent, orphaned, status, childOrder, _json: isJson };
    } catch (_) {}
  }
  const docs = Object.values(byId).map(({ _json, ...d }) => d);
  docs.sort((a, b) => String(b.updated || '').localeCompare(String(a.updated || '')));
  return docs;
}
async function getDoc(dataDir, id) {
  // prefer JSON
  try {
    const d = JSON.parse(await fsp.readFile(path.join(dataDir, id + '.json'), 'utf8'));
    return { id, format: 'json', ...d };
  } catch (_) {}
  // fall back to legacy markdown (client migrates it)
  const { meta, body } = parseDoc(await fsp.readFile(path.join(dataDir, id + '.md'), 'utf8'));
  return {
    id, format: 'markdown', title: meta.title || 'Untitled', icon: meta.icon || '', cover: meta.cover || '',
    comments: safeParse(meta.comments, {}), styles: safeParse(meta.styles, {}),
    content: body, updated: meta.updated, created: meta.created,
  };
}
async function saveDoc(dataDir, id, doc) {
  const jf = path.join(dataDir, id + '.json');
  let created = doc.created || new Date().toISOString();
  try { const e = JSON.parse(await fsp.readFile(jf, 'utf8')); if (e.created) created = e.created; }
  catch (_) { try { const { meta } = parseDoc(await fsp.readFile(path.join(dataDir, id + '.md'), 'utf8')); if (meta.created) created = meta.created; } catch (__) {} }
  const updated = new Date().toISOString();
  const out = {
    title: doc.title || 'Untitled', icon: doc.icon || '', cover: doc.cover || '',
    parent: doc.parent || '', orphaned: !!doc.orphaned, status: doc.status || '',
    created, updated,
    blocks: Array.isArray(doc.blocks) ? doc.blocks : [],
    comments: doc.comments && typeof doc.comments === 'object' ? doc.comments : {},
  };
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.writeFile(jf, JSON.stringify(out, null, 2), 'utf8');
  return { id, title: out.title, icon: out.icon, updated, created };
}

/* ---- static ------------------------------------------------------------ */
async function serveStatic(res, filePath) {
  try {
    const data = await fsp.readFile(filePath);
    send(res, 200, data, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
  } catch (_) { send(res, 404, 'Not found'); }
}

function launcherPage(reg) {
  const items = Object.entries(reg)
    .sort((a, b) => String(b[1].opened || '').localeCompare(String(a[1].opened || '')))
    .map(([id, w]) => `<li data-id="${id}">
        <div class="li-main"><a href="/w/${id}">${escapeHtml(w.title || 'Untitled')}</a><span>${escapeHtml(w.projectDir || '')}</span></div>
        <button class="del" data-id="${id}" title="Delete this project">🗑 Delete</button>
      </li>`)
    .join('') || '<p class="empty">No workspaces yet. Run <code>datac init</code> in a project folder.</p>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>datac — workspaces</title>
<style>
  body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#fff;color:#0a0a0a;max-width:680px;margin:60px auto;padding:0 24px}
  @media(prefers-color-scheme:dark){body{background:#0a0a0b;color:#fafafa}a{color:#fafafa}li{border-color:#27272a!important}li span{color:#a1a1aa!important}code{background:#27272a!important}.del{background:#1c1c1f!important;border-color:#27272a!important;color:#fafafa!important}}
  h1{font-size:22px;letter-spacing:-.02em}
  ul{list-style:none;padding:0}
  li{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:8px}
  .li-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
  li a{font-weight:600;font-size:16px;text-decoration:none;color:inherit}
  li span{font-size:12px;color:#71717a;font-family:ui-monospace,monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .del{flex:0 0 auto;font-size:13px;padding:7px 11px;border-radius:6px;border:1px solid #e5e5e5;background:#fafafa;color:#c4554d;cursor:pointer}
  .del:hover{background:#fdecec;border-color:#f0b7b3}
  code{background:#f4f4f5;padding:2px 6px;border-radius:4px;font-size:13px}
  .empty{color:#71717a}
</style></head><body>
<h1>◆ datac workspaces</h1><ul>${items}</ul>
<script>
document.querySelectorAll('.del').forEach(function(b){
  b.addEventListener('click', async function(){
    var li = b.closest('li');
    var name = li.querySelector('a').textContent;
    var typed = prompt('Delete project "'+name+'".\\n\\nThis permanently removes its dataC notes and open.dc and clears it from this list (the folder is kept unless it becomes empty). This cannot be undone.\\n\\nType the project name to confirm:');
    if(typed === null) return;                 // cancelled
    if(typed.trim() !== name.trim()){ alert('Name did not match — nothing was deleted.'); return; }
    b.disabled = true; b.textContent = 'Deleting…';
    try {
      var r = await fetch('/api/workspaces/'+b.dataset.id, { method:'DELETE' });
      if(r.ok){ li.remove(); if(!document.querySelectorAll('li').length){ document.querySelector('ul').innerHTML = '<p class="empty">No workspaces left.</p>'; } }
      else { b.disabled=false; b.textContent='🗑 Delete'; alert('Delete failed'); }
    } catch(e){ b.disabled=false; b.textContent='🗑 Delete'; alert('Delete failed'); }
  });
});
</script>
</body></html>`;
}
function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ---- server ------------------------------------------------------------ */
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    // Launcher
    if (pathname === '/' && req.method === 'GET') {
      return send(res, 200, launcherPage(await readRegistry()), { 'Content-Type': 'text/html; charset=utf-8' });
    }
    if (pathname === '/api/workspaces' && req.method === 'GET') {
      return sendJSON(res, 200, await readRegistry());
    }
    const wsDelMatch = pathname.match(/^\/api\/workspaces\/([^/]+)$/);
    if (wsDelMatch && req.method === 'DELETE') {
      const ok = await deleteWorkspace(wsDelMatch[1]);
      return sendJSON(res, ok ? 200 : 404, { ok });
    }

    // Editor shell for a workspace: /w/:id
    const wMatch = pathname.match(/^\/w\/([^/]+)\/?$/);
    if (wMatch && req.method === 'GET') {
      const dir = await workspaceDir(wMatch[1]);
      if (!dir) return send(res, 404, 'Unknown workspace. Run `datac init` in its folder.', { 'Content-Type': 'text/plain' });
      return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
    }

    // Workspace-scoped API: /api/w/:id/...
    const apiMatch = pathname.match(/^\/api\/w\/([^/]+)(\/.*)?$/);
    if (apiMatch) {
      const wid = apiMatch[1];
      const rest = apiMatch[2] || '/';
      const dataDir = await workspaceDir(wid);
      if (!dataDir) return sendJSON(res, 404, { error: 'unknown workspace' });
      const reg = await readRegistry();

      if (rest === '/info' && req.method === 'GET') {
        const w = reg[wid] || {};
        return sendJSON(res, 200, { id: wid, title: w.title || 'Untitled', projectDir: w.projectDir, dataDir });
      }

      // open the project folder in the OS file manager (local, trusted registry path)
      if (rest === '/reveal' && req.method === 'POST') {
        const w = reg[wid] || {};
        const dir = w.projectDir || dataDir;
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
        execFile(cmd, [dir], () => {});
        return sendJSON(res, 200, { ok: true, dir });
      }

      // native file picker — returns the chosen file's absolute path (no copy)
      if (rest === '/pick-file' && req.method === 'POST') {
        if (process.platform !== 'darwin') return sendJSON(res, 200, { error: 'picker only on macOS' });
        return execFile('osascript', ['-e', 'POSIX path of (choose file)'], (err, stdout) => {
          const p = (stdout || '').trim();
          if (err || !p) return sendJSON(res, 200, { cancelled: true });
          return sendJSON(res, 200, { path: p, name: path.basename(p) });
        });
      }

      // open a file (or reveal a missing one's folder) by absolute path
      if (rest === '/open-file' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        const p = body.path;
        if (!p) return sendJSON(res, 400, { error: 'path required' });
        if (!fs.existsSync(p)) return sendJSON(res, 404, { error: 'file not found' });
        const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
        execFile(cmd, [p], () => {});
        return sendJSON(res, 200, { ok: true });
      }

      if (rest === '/docs' && req.method === 'GET') return sendJSON(res, 200, await listDocs(dataDir));
      if (rest === '/docs' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        const id = crypto.randomBytes(8).toString('hex');
        return sendJSON(res, 201, await saveDoc(dataDir, id, body));
      }
      const docM = rest.match(/^\/docs\/([^/]+)$/);
      if (docM) {
        const id = safeId(docM[1]);
        if (!id) return sendJSON(res, 400, { error: 'bad id' });
        if (req.method === 'GET') { try { return sendJSON(res, 200, await getDoc(dataDir, id)); } catch (_) { return sendJSON(res, 404, { error: 'not found' }); } }
        if (req.method === 'PUT') { const body = JSON.parse((await readBody(req)).toString() || '{}'); return sendJSON(res, 200, await saveDoc(dataDir, id, body)); }
        if (req.method === 'DELETE') {
          for (const ext of ['.json', '.md']) { try { await fsp.unlink(path.join(dataDir, id + ext)); } catch (_) {} }
          return sendJSON(res, 200, { ok: true });
        }
      }

      if (rest === '/upload' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        const { name, dataUrl } = body;
        if (!dataUrl || !name) return sendJSON(res, 400, { error: 'name and dataUrl required' });
        const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/s);
        if (!m) return sendJSON(res, 400, { error: 'bad dataUrl' });
        const buf = Buffer.from(m[2], 'base64');
        const ext = path.extname(name).toLowerCase() || '';
        const safeBase = path.basename(name, ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'file';
        const fname = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${safeBase}${ext}`;
        const filesDir = path.join(dataDir, 'files');
        await fsp.mkdir(filesDir, { recursive: true });
        await fsp.writeFile(path.join(filesDir, fname), buf);
        return sendJSON(res, 201, { url: `/api/w/${wid}/files/${fname}`, name, size: buf.length });
      }

      const fileM = rest.match(/^\/files\/(.+)$/);
      if (fileM && req.method === 'GET') {
        return serveStatic(res, path.join(dataDir, 'files', path.basename(fileM[1])));
      }
      return sendJSON(res, 404, { error: 'not found' });
    }

    // Static front-end assets
    if (req.method === 'GET') {
      const rel = pathname.replace(/^\/+/, '');
      const filePath = path.join(PUBLIC_DIR, rel);
      if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
      return serveStatic(res, filePath);
    }

    send(res, 404, 'Not found');
  } catch (err) {
    console.error(err);
    sendJSON(res, 500, { error: String(err.message || err) });
  }
});

fs.mkdirSync(DATAC_HOME, { recursive: true });
server.listen(PORT, '127.0.0.1', () => {
  console.log(`datac daemon listening on http://127.0.0.1:${PORT}  (home: ${DATAC_HOME})`);
});

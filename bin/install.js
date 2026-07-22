#!/usr/bin/env node
'use strict';

/*
 * Install datac (the Next.js app) system-wide.
 *
 *   1. Build the Next.js standalone server (.next/standalone).
 *   2. Assemble a self-contained app at ~/.datac/app.
 *   3. Drop a `datac` launcher onto a PATH directory.
 *
 * The workspace registry (~/.datac/workspaces.json) and your project notes
 * are never touched; only the app code and the `datac` command are replaced.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const HOME = os.homedir();
const DATAC_HOME = process.env.DATAC_HOME || path.join(HOME, '.datac');
const APP = path.join(DATAC_HOME, 'app');
const APP_BAK = path.join(DATAC_HOME, 'app.bak');

const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  r: (s) => `\x1b[31m${s}\x1b[0m`,
};

function step(msg) { process.stdout.write(msg); }
function done() { process.stdout.write(' ' + c.g('✓') + '\n'); }

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  fs.cpSync(src, dst, { recursive: true });
}

try {
  console.log(c.b('Installing datac…'));

  // 1) build
  step('  building Next.js (standalone)…');
  execFileSync('npm', ['run', 'build'], { cwd: REPO, stdio: 'ignore' });
  const standalone = path.join(REPO, '.next', 'standalone');
  if (!fs.existsSync(path.join(standalone, 'server.js'))) {
    throw new Error('standalone build not found — check next.config output: "standalone"');
  }
  done();

  // 2) assemble ~/.datac/app
  step('  assembling ' + c.d(APP) + '…');
  fs.mkdirSync(DATAC_HOME, { recursive: true });
  fs.rmSync(APP_BAK, { recursive: true, force: true });
  if (fs.existsSync(APP)) fs.renameSync(APP, APP_BAK); // keep a backup of the previous app
  fs.mkdirSync(APP, { recursive: true });

  // standalone server + its minimal node_modules + package.json + traced .next
  fs.cpSync(standalone, APP, { recursive: true });
  // static assets and public files the standalone server serves
  copyDir(path.join(REPO, '.next', 'static'), path.join(APP, '.next', 'static'));
  if (fs.existsSync(path.join(REPO, 'public')))
    copyDir(path.join(REPO, 'public'), path.join(APP, 'public'));
  // prisma migrations — the server applies these to a fresh ~/.datac/datac.db
  // at startup (src/lib/db/bootstrap.ts); without them a new machine has an
  // empty database and every page fails to load
  copyDir(path.join(REPO, 'prisma', 'migrations'), path.join(APP, 'prisma', 'migrations'));
  // the CLI + icons
  copyDir(path.join(REPO, 'bin'), path.join(APP, 'bin'));
  if (fs.existsSync(path.join(REPO, 'assets')))
    copyDir(path.join(REPO, 'assets'), path.join(APP, 'assets'));
  fs.chmodSync(path.join(APP, 'bin', 'datac.js'), 0o755);
  // Runtime config: the standalone server loads .env from its cwd (this app
  // dir), so DATABASE_URL and friends must live here. Without it the daemon
  // has no database and every notes/board/calendar request fails.
  const envSrc = path.join(REPO, '.env');
  if (fs.existsSync(envSrc)) {
    fs.copyFileSync(envSrc, path.join(APP, '.env'));
    fs.chmodSync(path.join(APP, '.env'), 0o600);
  } else {
    console.log('\n  ' + c.r('!') + ' no .env in the repo — the daemon will have no DATABASE_URL.');
    console.log('    ' + c.d('cp .env.example .env, fill it in, and re-run npm run install-cli'));
  }
  done();

  // 3) launcher on PATH
  step('  installing the ' + c.b('datac') + ' command…');
  const launcher = `#!/bin/sh\nexec "${process.execPath}" "${path.join(APP, 'bin', 'datac.js')}" "$@"\n`;
  const candidates = ['/usr/local/bin', '/opt/homebrew/bin', path.join(HOME, '.local', 'bin')];
  let installedAt = null;
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      const p = path.join(dir, 'datac');
      fs.writeFileSync(p, launcher);
      fs.chmodSync(p, 0o755);
      installedAt = p;
      break;
    } catch (_) { /* try next */ }
  }
  if (!installedAt) throw new Error('no writable PATH directory found');
  done();

  console.log('');
  console.log(c.g('✓'), 'datac installed to', c.d(APP));
  console.log(c.g('✓'), 'command:', c.d(installedAt));
  if (fs.existsSync(APP_BAK)) console.log('  ' + c.d('previous app backed up to ' + APP_BAK));
  const onPath = (process.env.PATH || '').split(':').includes(path.dirname(installedAt));
  if (!onPath) {
    console.log('  ' + c.r('!') + ' add this to your shell profile:');
    console.log('      export PATH="' + path.dirname(installedAt) + ':$PATH"');
  }
  console.log('');
  console.log(c.b('Try it:'));
  console.log('    cd ~/some-project');
  console.log('    datac init "My Project"');
} catch (err) {
  console.error('\n' + c.r('✗ install failed:'), err.message || err);
  process.exit(1);
}

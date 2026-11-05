// LMP (Leo's Material Painter) desktop app (Electron). Runs LMP.html in its own window with the fast GPU,
// direct access to the presets folder next to LMP.exe, and .lmp project files (open / save / save as,
// double-click a .lmp in Explorer to open it).
const { app, BrowserWindow, ipcMain, session, shell, dialog, net } = require('electron');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

// Use the dedicated (high-performance) GPU on laptops with two, and never fall back to software.
app.commandLine.appendSwitch('force_high_performance_gpu');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192');

const exeDir = path.dirname(process.execPath);
const PROJECT_EXTS = ['.lmp', '.tpaint'];

// presets folder: next to LMP.exe, else the user's documents.
function presetsDir() {
  const candidates = [path.join(exeDir, 'presets'), path.join(exeDir, '..', 'presets'), path.join(app.getPath('documents'), 'LMP', 'presets')];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  const d = candidates[0];
  try { fs.mkdirSync(d, { recursive: true }); return d; } catch { return candidates[2]; }
}

function walk(dir, depth, rel, out) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile()) out.push({ name: e.name, dir: rel, path: full, size: fs.statSync(full).size });
    else if (e.isDirectory() && depth > 0) walk(full, depth - 1, rel ? `${rel}/${e.name}` : e.name, out);
  }
}

ipcMain.handle('presets:list', () => { const out = []; walk(presetsDir(), 3, '', out); return { root: presetsDir(), files: out }; });
ipcMain.handle('presets:read', (_e, p) => {
  const root = path.resolve(presetsDir());
  const full = path.resolve(p);
  if (!full.startsWith(root)) throw new Error('outside the presets folder');
  const b = fs.readFileSync(full);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
});
ipcMain.handle('presets:write', (_e, name, data) => {
  const safe = String(name).replace(/[\\/:*?"<>|]+/g, '_');
  const full = path.join(presetsDir(), safe);
  fs.writeFileSync(full, Buffer.from(data));
  return full;
});
ipcMain.handle('presets:open', () => shell.openPath(presetsDir()));

// ---------------------------------------------------------------- .lmp project files

let lastDir = '';
function projectsDir() {
  if (lastDir && fs.existsSync(lastDir)) return lastDir;
  const d = path.join(app.getPath('documents'), 'LMP Projects');
  try { fs.mkdirSync(d, { recursive: true }); } catch { /* fine */ }
  return d;
}
const safeName = (n) => (String(n || 'Untitled').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Untitled');

/** Save a project. With a path and !saveAs it overwrites silently; otherwise asks where. Returns the path or null. */
ipcMain.handle('project:save', async (e, name, data, filePath, saveAs) => {
  let target = filePath && !saveAs ? filePath : null;
  if (!target) {
    const win = BrowserWindow.fromWebContents(e.sender);
    const def = filePath ? filePath.replace(/\.(tpaint)$/i, '.lmp') : path.join(projectsDir(), `${safeName(name)}.lmp`);
    const r = await dialog.showSaveDialog(win, {
      title: saveAs ? 'Save LMP project as' : 'Save LMP project', defaultPath: def,
      filters: [{ name: 'LMP project', extensions: ['lmp'] }],
    });
    if (r.canceled || !r.filePath) return null;
    target = r.filePath.toLowerCase().endsWith('.lmp') ? r.filePath : r.filePath + '.lmp';
  }
  const tmp = target + '.saving';
  fs.writeFileSync(tmp, Buffer.from(data));
  fs.renameSync(tmp, target); // a crash mid-save never leaves a broken project
  lastDir = path.dirname(target);
  app.addRecentDocument(target);
  return target;
});

/** Ask for a project to open. Returns { path, data } or null. */
ipcMain.handle('project:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    title: 'Open LMP project', defaultPath: projectsDir(), properties: ['openFile'],
    filters: [{ name: 'LMP project', extensions: ['lmp', 'tpaint'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  return readProject(r.filePaths[0]);
});
ipcMain.handle('project:read', (_e, p) => readProject(p));
function readProject(p) {
  const b = fs.readFileSync(p);
  lastDir = path.dirname(p);
  app.addRecentDocument(p);
  return { path: p, data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
}

/** Any file to import (model, HDR, Substance file, textures...). */
ipcMain.handle('file:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    title: 'Import into LMP', properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Everything LMP can open', extensions: ['lmp', 'tpaint', 'glb', 'gltf', 'fbx', 'obj', 'hdr', 'sbsar', 'spsm', 'tpsmart', 'tpmat', 'tptex', 'tpbrush', 'tpgraph', 'png', 'jpg', 'jpeg', 'webp'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (r.canceled) return [];
  return r.filePaths.map((p) => { const b = fs.readFileSync(p); return { path: p, name: path.basename(p), data: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; });
});

/** Make .lmp files open in LMP and show the LMP icon in Explorer (current user only, no admin needed). */
function registerFileType() {
  if (process.platform !== 'win32' || process.env.LMP_NO_ASSOC) return;
  const exe = process.execPath;
  if (/electron\.exe$/i.test(exe)) return; // not when running from a dev copy
  const icon = path.join(exeDir, 'lmp-file.ico');
  const iconRef = fs.existsSync(icon) ? `"${icon}"` : `"${exe}",0`;
  const keys = [
    ['HKCU\\Software\\Classes\\.lmp', '', 'LMP.Project'],
    ['HKCU\\Software\\Classes\\.lmp', 'Content Type', 'application/x-lmp-project'],
    ['HKCU\\Software\\Classes\\LMP.Project', '', "LMP Project (Leo's Material Painter)"],
    ['HKCU\\Software\\Classes\\LMP.Project\\DefaultIcon', '', iconRef],
    ['HKCU\\Software\\Classes\\LMP.Project\\shell\\open', 'FriendlyAppName', 'LMP'],
    ['HKCU\\Software\\Classes\\LMP.Project\\shell\\open\\command', '', `"${exe}" "%1"`],
  ];
  let i = 0;
  const next = () => {
    if (i >= keys.length) { execFile('ie4uinit.exe', ['-show'], () => {}); return; }
    const [k, v, d] = keys[i++];
    const args = ['add', k, ...(v ? ['/v', v] : ['/ve']), '/d', d, '/f'];
    execFile('reg.exe', args, { windowsHide: true }, () => next());
  };
  next();
}

// ---------------------------------------------------------------- autosave, crash recovery, recent files

function autosaveDir() {
  const tries = [];
  if (process.platform === 'win32' && fs.existsSync('D:\\')) tries.push('D:\\LMP\\autosave');
  tries.push(path.join(exeDir, 'autosave'), path.join(app.getPath('userData'), 'autosave'));
  for (const d of tries) {
    try { fs.mkdirSync(d, { recursive: true }); fs.accessSync(d, fs.constants.W_OK); return d; } catch { /* next */ }
  }
  return tries[tries.length - 1];
}
const metaOf = (f) => f.replace(/\.lmp$/i, '.json');

/** Write an autosave (keeps the newest `keep` per project). */
ipcMain.handle('autosave:write', (_e, name, data, thumb, projectPath, keep) => {
  const dir = autosaveDir();
  const base = safeName(name);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${base}__${stamp}.lmp`);
  fs.writeFileSync(file + '.saving', Buffer.from(data));
  fs.renameSync(file + '.saving', file);
  fs.writeFileSync(metaOf(file), JSON.stringify({ name, time: Date.now(), projectPath: projectPath || '', thumb: thumb || '' }));
  const mine = fs.readdirSync(dir).filter((f) => f.startsWith(base + '__') && f.endsWith('.lmp')).sort().reverse();
  for (const old of mine.slice(Math.max(1, keep || 5))) {
    try { fs.unlinkSync(path.join(dir, old)); fs.unlinkSync(metaOf(path.join(dir, old))); } catch { /* fine */ }
  }
  return file;
});
ipcMain.handle('autosave:list', () => {
  const dir = autosaveDir();
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.lmp')); } catch { return []; }
  return files.map((f) => {
    const full = path.join(dir, f);
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaOf(full), 'utf8')); } catch { /* no meta */ }
    const st = fs.statSync(full);
    return { path: full, name: meta.name || f.replace(/__.*$/, ''), time: meta.time || st.mtimeMs, thumb: meta.thumb || '', projectPath: meta.projectPath || '', size: st.size };
  }).sort((a, b) => b.time - a.time);
});
ipcMain.handle('autosave:open-folder', () => shell.openPath(autosaveDir()));

const lockFile = () => path.join(app.getPath('userData'), 'session.lock');
/** Was the last session closed properly? (A crash leaves the lock file behind.) */
ipcMain.handle('session:start', () => {
  const crashed = fs.existsSync(lockFile());
  try { fs.writeFileSync(lockFile(), String(Date.now())); } catch { /* fine */ }
  return { crashed };
});
app.on('will-quit', () => { try { fs.unlinkSync(lockFile()); } catch { /* fine */ } });

const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
function readRecent() { try { return JSON.parse(fs.readFileSync(recentFile(), 'utf8')); } catch { return []; } }
ipcMain.handle('recent:list', () => readRecent().filter((r) => fs.existsSync(r.path)));
ipcMain.handle('recent:add', (_e, p, name, thumb) => {
  const list = readRecent().filter((r) => r.path !== p);
  list.unshift({ path: p, name, thumb: thumb || '', time: Date.now() });
  try { fs.writeFileSync(recentFile(), JSON.stringify(list.slice(0, 12))); } catch { /* fine */ }
  return true;
});
ipcMain.handle('recent:remove', (_e, p) => { try { fs.writeFileSync(recentFile(), JSON.stringify(readRecent().filter((r) => r.path !== p))); } catch { /* fine */ } return true; });

// ---------------------------------------------------------------- updates (GitHub releases)

const REPO = 'LeoDevRX/LMP';
const RELEASES = `https://github.com/${REPO}/releases/latest`;
async function getJSON(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'LMP-updater', Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub answered ${r.status}`);
  return r.json();
}
async function getBytes(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'LMP-updater' } });
  if (!r.ok) throw new Error(`Download failed (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}
/** The small update zip of a release (LMP-vX.XX-update.zip). */
const updateAsset = (rel) => (rel.assets || []).find((a) => /^LMP-v[\d.]+-update\.zip$/i.test(a.name));
/** The newest release: { version, notes, url, hasUpdateFiles } or { error } when offline. */
ipcMain.handle('update:check', async () => {
  try {
    const rel = await getJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
    return { version: String(rel.tag_name || '').replace(/^v/i, ''), notes: rel.body || '', url: rel.html_url || RELEASES, hasUpdateFiles: !!updateAsset(rel) };
  } catch (e) { return { error: String(e.message || e) }; }
});

/** Read the files of a zip (stored or deflated entries; enough for LMP's own update zips). */
function unzip(buf) {
  const zlib = require('zlib');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('The update file is damaged');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The update file is damaged');
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (name.endsWith('/')) continue;
    const ln = buf.readUInt16LE(off + 26), lx = buf.readUInt16LE(off + 28);
    const data = buf.subarray(off + 30 + ln + lx, off + 30 + ln + lx + csize);
    out.set(name, method === 0 ? Buffer.from(data) : method === 8 ? zlib.inflateRawSync(data) : null);
  }
  return out;
}

/** Download the newest release's small update zip, check it, and swap the app files in. Needs a restart after. */
ipcMain.handle('update:install', async () => {
  const appDir = __dirname;
  try {
    const rel = await getJSON(`https://api.github.com/repos/${REPO}/releases/latest`);
    const asset = updateAsset(rel);
    if (!asset) throw new Error('This release has no update file');
    const zip = await getBytes(asset.browser_download_url);
    if (asset.size && zip.length !== asset.size) throw new Error('The download was cut off');
    const want = String(asset.digest || '').replace(/^sha256:/i, '');
    if (want && crypto.createHash('sha256').update(zip).digest('hex') !== want) throw new Error('The update didn\'t download correctly');
    // Only the app's own files (LMP/resources/app/*), never anything outside that folder.
    const files = [...unzip(zip)].filter(([n, b]) => b && /^LMP\/resources\/app\/[\w.-]+$/.test(n)).map(([n, b]) => [n.split('/').pop(), b]);
    if (!files.some(([n]) => n === 'LMP.html')) throw new Error('The update file is missing LMP.html');
    fs.accessSync(appDir, fs.constants.W_OK);
    for (const [name, b] of files) fs.writeFileSync(path.join(appDir, name + '.new'), b);
    for (const [name] of files) {
      const target = path.join(appDir, name);
      if (fs.existsSync(target)) fs.copyFileSync(target, target + '.bak');
      fs.renameSync(target + '.new', target);
    }
    return { ok: true, version: String(rel.tag_name || '').replace(/^v/i, '') };
  } catch (e) {
    const msg = String(e.message || e);
    return { ok: false, error: /EACCES|EPERM|EROFS/.test(msg) ? 'LMP can\'t write to its own folder (it may be in a protected place like Program Files).' : msg, url: RELEASES };
  }
});
ipcMain.handle('app:relaunch', () => { app.relaunch(); app.exit(0); });
ipcMain.handle('shell:open', (_e, url) => {
  if (/^https:\/\/github\.com\/LeoDevRX\//i.test(String(url))) shell.openExternal(String(url));
});

// ---------------------------------------------------------------- window

let mainWin = null;
let pendingOpen = null;
const projectArg = (argv) => argv.slice(1).find((a) => PROJECT_EXTS.includes(path.extname(a).toLowerCase()) && fs.existsSync(a)) || null;
function sendOpen(p) {
  if (!p) return;
  if (mainWin && mainWin.webContents && !mainWin.webContents.isLoading()) mainWin.webContents.send('project:open-path', p);
  else pendingOpen = p;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 960, show: false, backgroundColor: '#17181a', icon: path.join(__dirname, 'lmp.ico'), title: "LMP — Leo's Material Painter",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      backgroundThrottling: false,
      spellcheck: false,
    },
  });
  mainWin = win;
  win.removeMenu();
  win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'LMP.html'));
  win.webContents.on('did-finish-load', () => { if (pendingOpen) { const p = pendingOpen; pendingOpen = null; win.webContents.send('project:open-path', p); } });
  // F12 = developer tools (for reporting problems), F11 = full screen.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
  });
  // Links open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  // Closing: LMP shows its own "unsaved changes" dialog (Save now / Quit without saving / Cancel).
  let allowClose = false;
  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    let acked = false;
    const onAck = (ev) => { if (ev.sender === win.webContents) acked = true; };
    ipcMain.once('app:close-ack', onAck);
    win.webContents.send('app:close-request');
    // If the page doesn't answer (it crashed or hung), fall back to a plain question.
    setTimeout(() => {
      ipcMain.removeListener('app:close-ack', onAck);
      if (acked || allowClose) return;
      const r = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Quit', 'Cancel'], defaultId: 1, message: 'LMP is not responding. Quit anyway?' });
      if (r === 0) { allowClose = true; win.destroy(); }
    }, 2500);
  });
  ipcMain.on('app:quit', (ev) => { if (ev.sender === win.webContents) { allowClose = true; win.close(); } });
}

// One LMP at a time: double-clicking another .lmp opens it in the running window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); }
    sendOpen(projectArg(argv));
  });
  app.setAppUserModelId('Leo.LMP');
  app.whenReady().then(() => {
    // Folder / file pickers (File System Access API) and clipboard without prompts.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(true));
    session.defaultSession.setPermissionCheckHandler(() => true);
    pendingOpen = projectArg(process.argv);
    createWindow();
    registerFileType();
  });
  app.on('window-all-closed', () => app.quit());
}

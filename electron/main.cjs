/**
 * Electron main process (CommonJS).
 * electron-updater instantiates its updater at require-time and expects the
 * classic CJS `electron` module, so the main process intentionally stays CJS.
 */
const { app, BrowserWindow, Menu, dialog, ipcMain, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater');

const SMOKE = process.argv.includes('--smoke');
const HIDDEN = process.argv.includes('--hidden') || SMOKE;
const PORT = Number(process.env.IELTS_DESKTOP_PORT || 47119);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const APP_ID = 'com.speakingstudio.ielts';

let mainWindow = null;
let serverProcess = null;
let quitting = false;
let updateConfig = { url: '', enabled: false };

/* --------------------------------- helpers -------------------------------- */

function startupLogFile() {
  try {
    return path.join(app.getPath('userData'), 'startup.log');
  } catch {
    return '';
  }
}

function logLine(message) {
  const file = startupLogFile();
  if (!file) return;
  try {
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${message}\n`, 'utf8');
  } catch {
    /* logging must never break startup */
  }
}

function log(...args) {
  const text = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  logLine(text);
  if (!app.isPackaged || SMOKE) console.log('[desktop]', ...args);
}

if (process.argv.includes('--smoke')) log(`startup version=${app.getVersion()} packaged=${app.isPackaged} port=${PORT}`);

function readUpdateConfig() {
  try {
    const file = path.join(app.getAppPath(), 'electron', 'update-config.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const url = typeof raw.url === 'string' ? raw.url.trim() : '';
    return { url, enabled: Boolean(url) };
  } catch {
    return { url: '', enabled: false };
  }
}

function serverEntry() {
  return path.join(app.getAppPath(), 'server', 'index.mjs');
}

async function health(timeoutMs = 1200) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${ORIGIN}/api/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok ? data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(totalMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < totalMs) {
    const data = await health();
    if (data) return data;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('本地服务启动超时');
}

function startServer() {
  return new Promise((resolve, reject) => {
    const entry = serverEntry();
    if (!fs.existsSync(entry)) return reject(new Error(`找不到本地服务入口：${entry}`));

    serverProcess = spawn(process.execPath, [entry, '--serve'], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        HOST: '127.0.0.1',
        PORT: String(PORT),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    serverProcess.stdout.on('data', (d) => log(String(d).trim()));
    serverProcess.stderr.on('data', (d) => log('server error:', String(d).trim()));

    serverProcess.on('exit', (code) => {
      serverProcess = null;
      if (code && code !== 0 && !quitting) {
        dialog.showErrorBox('本地服务已退出', `服务进程退出，代码 ${code}。请重新启动应用。`);
      }
    });

    serverProcess.on('error', (err) => reject(err));
    resolve();
  });
}

async function ensureServer() {
  const existing = await health();
  if (existing) {
    log('reusing a running server on', PORT);
    return;
  }
  await startServer();
  await waitForServer();
}

function stopServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill();
  } catch {
    /* ignore */
  }
  serverProcess = null;
}

/* --------------------------------- update --------------------------------- */

function sendUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('update:status', payload);
}

function setupUpdater() {
  updateConfig = readUpdateConfig();
  if (!updateConfig.enabled) {
    log('update feed not configured');
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on('checking-for-update', () => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdate({ state: 'available', version: info.version }));
  autoUpdater.on('update-not-available', () => sendUpdate({ state: 'none' }));
  autoUpdater.on('download-progress', (p) => sendUpdate({ state: 'downloading', percent: Math.round(p.percent) }));
  autoUpdater.on('update-downloaded', (info) =>
    sendUpdate({ state: 'downloaded', version: info.version }),
  );
  autoUpdater.on('error', (err) => sendUpdate({ state: 'error', message: err?.message || String(err) }));

  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: updateConfig.url });
  } catch (err) {
    log('setFeedURL failed', err?.message);
  }

  if (app.isPackaged && !SMOKE) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => log('update check failed', err?.message));
    }, 6000);
  }
}

/* --------------------------------- window --------------------------------- */

function createWindow() {
  // A missing icon must never prevent the window from opening.
  const iconPath = path.join(app.getAppPath(), 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#eef1f7',
    autoHideMenuBar: false,
    title: 'IELTS Speaking Studio',
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  mainWindow.loadURL(ORIGIN);
  logLine(`window created, loading ${ORIGIN}`);

  // If the renderer never becomes ready, show the window anyway instead of
  // leaving an invisible process that also holds the single-instance lock.
  const showFallback = setTimeout(() => {
    if (!HIDDEN && mainWindow && !mainWindow.isVisible() && !mainWindow.isDestroyed()) {
      logLine('ready-to-show timeout, showing window anyway');
      mainWindow.show();
    }
  }, 8000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(showFallback);
    logLine('ready-to-show');
    if (!HIDDEN) {
      mainWindow.show();
      if (SMOKE) console.log('[desktop] window shown');
    }
  });

  mainWindow.webContents.on('did-finish-load', () => logLine('did-finish-load'));
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    logLine(`did-fail-load code=${code} ${description} url=${url}`);
    if (!HIDDEN) dialog.showErrorBox('页面加载失败', `${description}（${code}）\n${url}`);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    log('renderer gone', details.reason);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [{ role: 'quit', label: '退出' }],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'forceReload', label: '强制重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '检查更新…',
          click: () => {
            if (!updateConfig.enabled) {
              dialog.showMessageBox({
                type: 'info',
                title: '检查更新',
                message: '尚未配置更新源',
                detail: '发布时在 electron/update-config.json 里填入更新地址即可。',
              });
              return;
            }
            autoUpdater.checkForUpdates().catch((err) =>
              dialog.showErrorBox('检查更新失败', err?.message || String(err)),
            );
          },
        },
        {
          label: '打开数据文件夹',
          click: () => shell.openPath(app.getPath('userData')),
        },
        { type: 'separator' },
        {
          label: `关于 IELTS Speaking Studio ${app.getVersion()}`,
          click: () => {
            dialog.showMessageBox({
              type: 'info',
              title: '关于',
              message: `IELTS Speaking Studio ${app.getVersion()}`,
              detail: [
                `Electron ${process.versions.electron}`,
                `Chromium ${process.versions.chrome}`,
                `Node ${process.versions.node}`,
                '',
                `数据目录：${app.getPath('userData')}`,
              ].join('\n'),
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ----------------------------------- ipc ---------------------------------- */

function registerIpc() {
  ipcMain.handle('desktop:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    isPackaged: app.isPackaged,
    userData: app.getPath('userData'),
    updateConfigured: updateConfig.enabled,
    updateUrl: updateConfig.url,
  }));

  ipcMain.handle('backup:save', (_event, json) => {
    try {
      if (typeof json !== 'string' || json.length > 30 * 1024 * 1024) {
        return { ok: false, error: '备份内容过大' };
      }
      const dir = path.join(app.getPath('userData'), 'backups');
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = path.join(dir, `backup-${app.getVersion()}-${stamp}.json`);
      fs.writeFileSync(file, json, 'utf8');

      // keep the 10 most recent backups
      const files = fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      for (const extra of files.slice(10)) {
        try {
          fs.unlinkSync(path.join(dir, extra.f));
        } catch {
          /* ignore */
        }
      }
      return { ok: true, path: file };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('update:check', () => {
    if (!updateConfig.enabled) return { ok: false, reason: 'not-configured' };
    autoUpdater.checkForUpdates().catch((err) => sendUpdate({ state: 'error', message: err?.message }));
    return { ok: true };
  });

  ipcMain.handle('update:download', () => {
    autoUpdater.downloadUpdate().catch((err) => sendUpdate({ state: 'error', message: err?.message }));
    return { ok: true };
  });

  ipcMain.handle('update:install', () => {
    quitting = true;
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });

  ipcMain.handle('app:open-data', () => shell.openPath(app.getPath('userData')));
}

/* ---------------------------------- boot ---------------------------------- */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logLine('another instance already holds the single-instance lock; quitting');
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
      const ok = permission === 'media' && wc.getURL().startsWith(ORIGIN);
      callback(ok);
    });
    session.defaultSession.setPermissionCheckHandler(
      (_wc, permission, requestingOrigin) => permission === 'media' && requestingOrigin.startsWith(ORIGIN),
    );

    registerIpc();
    buildMenu();
    setupUpdater();

    try {
      await ensureServer();
      logLine(`server ready on ${ORIGIN}`);
    } catch (err) {
      logLine(`server failed: ${err?.stack || err?.message || err}`);
      dialog.showErrorBox('启动失败', err?.message || String(err));
      app.quit();
      return;
    }

    try {
      createWindow();
    } catch (err) {
      logLine(`createWindow failed: ${err?.stack || err?.message || err}`);
      dialog.showErrorBox('窗口创建失败', err?.message || String(err));
      app.quit();
      return;
    }

    if (SMOKE) {
      const timeout = setTimeout(() => {
        console.error('SMOKE_TIMEOUT');
        app.exit(2);
      }, 60000);
      mainWindow.webContents.once('did-finish-load', async () => {
        try {
          const title = await mainWindow.webContents.executeJavaScript('document.title');
          const body = await mainWindow.webContents.executeJavaScript('document.body.innerText.slice(0,60)');
          const h = await health();
          console.log(
            `SMOKE_OK version=${app.getVersion()} port=${PORT} title=${JSON.stringify(title)} health=${Boolean(h)} body=${JSON.stringify(body)}`,
          );
          clearTimeout(timeout);
          quitting = true;
          stopServer();
          app.quit();
        } catch (err) {
          console.error('SMOKE_FAIL', err?.message || String(err));
          clearTimeout(timeout);
          app.exit(1);
        }
      });
    }
  }).catch((err) => {
    logLine(`whenReady failed: ${err?.stack || err?.message || err}`);
    dialog.showErrorBox('启动失败', err?.message || String(err));
    app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    quitting = true;
    stopServer();
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopServer();
  });
}

'use strict';
const { app, BrowserWindow, WebContentsView, BrowserView, Menu, ipcMain, screen, shell, nativeTheme, dialog, session } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');
const os = require('node:os');
const { supportsOverlay, isUnmaintainedElectron, legacyBrowserWarning } = require('./os-compat.cjs');
const { TOP_DOCK_CLEARANCE, dockRects, floatingRects, intersectsRect, chooseDockPlacement } = require('./layout.cjs');
const { normalizeFloatingBounds, restoreFloatingBounds, floatingLayoutKey } = require('./workspace.cjs');
const { CHROME_HEIGHT, standaloneWindowChrome, standaloneHeaderCSS, dockedWindowEdgeCSS } = require('./standalone-chrome.cjs');
const { SITE_LANGUAGE_PICKER_CSS, siteLanguagePickerScript } = require('./site-language-picker.cjs');
const { LANGUAGES, nativeT } = require('./native-i18n.cjs');
const { PROVIDERS, PANELS, normalizeSettings, normalizeProfile, matchesTerminal, availablePanels } = require('./profiles.cjs');
const { DesktopTickerRelayClient, MetaScalpTickerSender } = require('./desktop-link-client.cjs');

const WEBSITE = 'https://h00k.top/';
// Make the native Windows captions match the dark h00k desktop surfaces.
if (process.platform === 'win32' && nativeTheme) nativeTheme.themeSource = 'dark';
// Align Windows taskbar notifications and pinned shortcuts with the branded EXE.
if (process.platform === 'win32') app.setAppUserModelId('top.h00k.desktop');
const LABELS = { metascalp: 'MetaScalp', tiger: 'Tiger.Trade', vataga: 'Vataga' };
let settingsWindow = null;
let settings = normalizeSettings();
let statePath = '';
let agent = null;
let quitting = false;
let desktopLinkStatus = 'disabled';
let desktopLinkClient = null;
const metaScalpTickerSender = new MetaScalpTickerSender();
async function desktopSessionCookie() {
  // Read the existing *web-app* session; never place credentials in renderer IPC.
  // Sign in using h00k Desktop's separate h00k window first.
  const cookies = await session.fromPartition('persist:h00k').cookies.get({url: WEBSITE});
  const record = cookies.find(cookie =>
    cookie.name === '__Host-h00k-session' || cookie.name === 'h00k-session');
  return record ? record.name + '=' + record.value : null;
}
function syncDesktopLink() {
  if (!settings.remoteLinkEnabled) {
    desktopLinkClient?.stop();
    desktopLinkClient = null;
    desktopLinkStatus = 'disabled';
    pushSnapshot();
    return;
  }
  if (desktopLinkClient) return;
  desktopLinkClient = new DesktopTickerRelayClient({
    getCookie: desktopSessionCookie,
    onCommand: command => metaScalpTickerSender.send(command),
    onStatus: status => {
      desktopLinkStatus = status;
      pushSnapshot();
    },
  });
  desktopLinkClient.start();
}
let detected = [];
let manualTargets = new Map(); // handle choices last only for this run
let manualAttached = new Set();
let windows = new Map(); // provider -> Map(panel -> BrowserWindow)
let previousSnapshots = '';
let lastDockStatus = {};
let standalone = null;
const toolbarOwners = new Map(); // local-only WebContentsView IDs, never exposed to h00k.top
const resizeOwners = new Map(); // separately sandboxed top-edge handles for attached panes
const activeDockResizes = new Map(); // live gestures; persist only on completion
const lastLayoutKeys = new Map(); // detect explicit side/mode/size changes, even when follow is off
const autoPlacements = new Map(); // stabilize automatic side/monitor choices
const hiddenProviders = new Map(); // reclaim hidden webviews after prolonged terminal absence
const HIDDEN_RECLAIM_MS = 30_000;
const ECO_HIDDEN_RECLAIM_MS = 5_000;
const ECO_AGENT_INTERVAL_MS = 1_250; // versus 250 ms in normal mode
const MAX_MULTI_WINDOWS = 4; // per-provider limit for independently loaded full-site views
const MAX_TOTAL_MULTI_PANES = 6; // global active multi-view budget across terminal types
const GEOMETRY_REFRESH_MS = 2_000; // inexpensive periodic recovery / hidden-view cleanup
const TITLE_SNAPSHOT_MS = 1_000; // avoid IPC churn on fast changing PnL / price captions
const MULTI_MISSING_GRACE_MS = 1_250; // a missed native snapshot must not reload h00k
const missingMultiSince = new Map(); // provider + HWND -> first absent / blocked time
let previousWindowGeometry = '';
let lastGeometrySyncAt = 0;
let lastTrackerSnapshotAt = 0;
let forceNextLayout = false; // restore a pane when the user closes it manually
const multiPlacements = new Map(); // stable side per native HWND in multi-window mode

function loadSettings() {
  statePath = path.join(app.getPath('userData'), 'smartdock.json');
  try { settings = normalizeSettings(JSON.parse(fs.readFileSync(statePath, 'utf8'))); }
  catch { settings = normalizeSettings(); }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temp = statePath + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(settings, null, 2), { mode: 0o600 });
    fs.renameSync(temp, statePath);
  } catch (err) {
    console.error('Не вдалося зберегти налаштування h00k Desktop:', err.message);
  }
}
function isTrustedWebURL(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && u.hostname === 'h00k.top' && !u.username && !u.password; }
  catch { return false; }
}
function webURL(id) {
  const url = new URL(WEBSITE);
  // Opt-in only for this Electron app. Public quotes can be reused for a few
  // seconds across its separate windows without changing ordinary h00k.top.
  url.searchParams.set('h00kDesktop', '1');
  if (id === 'full') return url.href;
  const panel = PANELS.find(x => x.id === id);
  if (!panel) throw new Error('Unknown panel');
  url.searchParams.set('desktopPanel', id);
  url.hash = panel.hash;
  return url.href;
}
function guardWebsite(win, chromeCSS = null) {
  // All h00k page panes (standalone, docked and floating) use the same local
  // presentation-only adapter. The public browser site is not modified.
  win.webContents.on('did-finish-load', () => {
    if (win.isDestroyed() || !isTrustedWebURL(win.webContents.getURL())) return;
    const page = win.webContents;
    const styleTasks = [page.insertCSS(SITE_LANGUAGE_PICKER_CSS)];
    if (chromeCSS) styleTasks.push(page.insertCSS(chromeCSS));
    void Promise.all(styleTasks)
      .then(() => {
        if (!win.isDestroyed() && isTrustedWebURL(page.getURL())) {
          return page.executeJavaScript(siteLanguagePickerScript());
        }
      }).catch(error => console.warn('Desktop language picker setup failed:', error.message));
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedWebURL(url)) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
}
function attachDockToolbar(win, provider) {
  // Local, privileged toolbar overlays the *unprivileged* h00k web page.
  // The remote h00k renderer has no preload and cannot invoke Desktop IPC.
  // Use old BrowserView only where WebContentsView does not exist (Electron 22).
  // Both views host a local, isolated toolbar; h00k.top gets no privileged preload.
  const useLegacyView = typeof WebContentsView !== 'function';
  const ToolbarView = useLegacyView ? BrowserView : WebContentsView;
  if (typeof ToolbarView !== 'function') throw new Error('Unsupported Electron view API');
  const toolbar = new ToolbarView({
    webPreferences: {
      preload: path.join(__dirname, 'toolbar-preload.cjs'),
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true,
    },
  });
  // Cache webContents while the native view is alive. Accessing
  // toolbar.webContents from BrowserWindow 'closed' may throw on Windows:
  // the native WebContentsView can already have been destroyed.
  const toolbarContents = toolbar.webContents;
  toolbar.setBackgroundColor('#00000000');
  if (useLegacyView) win.setBrowserView(toolbar);
  else win.contentView.addChildView(toolbar);
  // Frameless attached panes have no native resize grip. Add a narrow, local
  // top-edge hit target; do not grant any native IPC to the remote website.
  // Electron 22's single BrowserView fallback intentionally keeps its old
  // gear-only behavior instead of replacing or overlapping that view.
  let resizeView = null;
  let resizeContents = null;
  if (provider !== null && !useLegacyView) {
    resizeView = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, 'resize-preload.cjs'),
        nodeIntegration: false, contextIsolation: true, sandbox: true,
        webSecurity: true,
      },
    });
    resizeContents = resizeView.webContents;
    resizeView.setBackgroundColor('#00000000');
    win.contentView.addChildView(resizeView);
    resizeOwners.set(resizeContents.id, { win, provider, contents: resizeContents });
    resizeContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    resizeContents.on('will-navigate', event => event.preventDefault());
    void resizeContents.loadFile(path.join(__dirname, 'resize-handle.html'))
      .catch(error => {
        if (!resizeContents.isDestroyed())
          console.warn('h00k Desktop resize handle failed:',error.message);
      });
  }
  const place = () => {
    if (win.isDestroyed() || toolbarContents.isDestroyed()) return;
    const width = win.getContentBounds().width;
    const custom = provider === null && supportsOverlay(process.platform,os.release(),process.versions.electron);
    // Standalone: one compact full-width, privileged toolbar. Blank space is
    // draggable; five left-side actions and the right-side window controls
    // are not. Attached panes keep their settings shortcut entirely inside the
    // 20px chrome already reserved by standaloneHeaderCSS, never over the site.
    if (custom) toolbar.setBounds({ x: 0, y: 0, width, height: CHROME_HEIGHT });
    else toolbar.setBounds({ x: Math.max(0, width - 24), y: 0, width: 24, height: CHROME_HEIGHT });
    if (resizeView && resizeContents && !resizeContents.isDestroyed()) {
      // A 10px strip along the upper edge, leaving the gear and chart buttons
      // untouched. Only docked panes above a terminal use top-edge resizing.
      const active = win.__h00kMode === 'docked' && win.__h00kDockSide === 'top'
        && win.isVisible() && settings.profiles[provider]?.mode !== 'multi';
      resizeView.setBounds({ x: 0, y: 0, width: Math.max(0,width-48), height: active ? 10 : 0 });
    }
  };
  win.__h00kUpdateResizeHandle = place;
  place();
  win.on('resize', place);
  const sendFullscreenState = () => {
    if (!toolbarContents.isDestroyed() && provider === null) {
      toolbarContents.send('desktop:toolbar-window-state', { fullscreen: win.isFullScreen() });
    }
  };
  if (provider === null && supportsOverlay(process.platform,os.release(),process.versions.electron)) {
    win.on('enter-full-screen', sendFullscreenState);
    win.on('leave-full-screen', sendFullscreenState);
  }
  toolbarContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  toolbarContents.on('will-navigate', event => event.preventDefault());
  const custom = provider === null && supportsOverlay(process.platform,os.release(),process.versions.electron);
  toolbarContents.loadFile(path.join(__dirname, 'toolbar.html'), { query: { controls: custom ? '1' : '0' } })
    .catch(error => {
      if (!toolbarContents.isDestroyed())
        console.error('h00k Desktop toolbar failed:', error.message);
    });
  const toolbarId = toolbarContents.id;
  toolbarOwners.set(toolbarId, { win, provider, contents: toolbarContents });
  win.on('closed', () => {
    toolbarOwners.delete(toolbarId);
    if (resizeContents) {
      const gesture = activeDockResizes.get(resizeContents.id);
      if (gesture?.changed) { saveSettings(); pushSnapshot(); }
      activeDockResizes.delete(resizeContents.id);
      resizeOwners.delete(resizeContents.id);
      if (!resizeContents.isDestroyed()) {
        try { resizeContents.close(); }
        catch (error) {
          if (!resizeContents.isDestroyed())
            console.warn('h00k Desktop resize handle cleanup failed:',error.message);
        }
      }
    }
    // The BrowserWindow is already destroyed here. Close the cached content
    // if still alive, but never dereference the destroyed native view again.
    // Explicitly closing a surviving WebContentsView prevents leaks.
    if (!toolbarContents.isDestroyed()) {
      try { toolbarContents.close(); }
      catch (error) {
        if (!toolbarContents.isDestroyed())
          console.warn('h00k Desktop toolbar cleanup failed:', error.message);
      }
    }
  });
}

function makeContentWindow(provider, id, mode = 'full', collectionKey = id) {
  const win = new BrowserWindow({
    title: 'h00k • ' + LABELS[provider] + ' • ' + (id === 'full' ? 'Desktop' : PANELS.find(x=>x.id===id)?.name),
    x: 100, y: 100, width: 480, height: 470,
    minWidth: 200, minHeight: 140, show: false, backgroundColor: '#070a12',
    // Docked windows have no shadow/invisible Windows resize border at their seam.
    frame: mode === 'floating',
    hasShadow: mode === 'floating',
    thickFrame: mode === 'floating',
    roundedCorners: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, partition: 'persist:h00k',
    },
  });
  win.__h00kMode = mode === 'floating' ? 'floating' : 'docked';
  win.__h00kUrl = webURL(id);
  win.__h00kLoaded = false; // Never load a scanner for a panel without display space.
  win.__nextLoadAt = 0;
  win.__autoPlacing = false;
  // The border is a local, pointer-transparent Desktop decoration, never a
  // change to the public site. Floating windows keep their native frame.
  guardWebsite(win, process.platform === 'win32'
    ? standaloneHeaderCSS() + (mode === 'floating' ? '' : dockedWindowEdgeCSS())
    : null);
  attachDockToolbar(win, provider);
  let persistTimer = null;
  const persistManualBounds = () => {
    if (win.isDestroyed() || win.__autoPlacing || !win.isVisible()) return;
    const profile = settings.profiles[provider];
    if (profile.mode !== 'floating' || profile.follow || win.__h00kMode !== 'floating') return;
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (win.isDestroyed() || win.__autoPlacing) return;
      const active = settings.profiles[provider];
      if (active.mode !== 'floating' || active.follow) return;
      const bounds = normalizeFloatingBounds(win.getBounds());
      if (!bounds || !PANELS.some(panel => panel.id === id)) return;
      const previous = active.floatingBounds[id];
      if (previous && Object.keys(bounds).every(key => previous[key] === bounds[key])) return;
      active.floatingBounds[id] = bounds;
      saveSettings();
      pushSnapshot();
    }, 450);
  };
  win.on('moved', persistManualBounds);
  win.on('resized', persistManualBounds);
  win.on('closed', () => clearTimeout(persistTimer));
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && input.key === ',') {
      event.preventDefault();
      openSettingsWindow(provider);
    }
  });
  win.on('closed', () => {
    const collection = windows.get(provider);
    if (collection?.get(collectionKey) === win) {
      collection.delete(collectionKey);
      // The Win32 geometry may be unchanged, but a manually closed pane must
      // be recreated if docking is still enabled (not silently wait 2 seconds).
      forceNextLayout = !quitting;
    }
    missingMultiSince.delete(provider+':'+collectionKey);
  });
  return win;
}
function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    title: 'h00k Desktop • ' + nativeT('settingsTitle',settings.uiLanguage), width: 780, height: 830, minWidth: 580, minHeight: 590,
    backgroundColor: '#070d18', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false,
      contextIsolation: true, sandbox: true,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.webContents.on('did-finish-load', () => {
    previousSnapshots = '';
    pushSnapshot();
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}
function openSettingsWindow(provider) {
  if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow();
  const show = () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    if (settingsWindow.isMinimized()) settingsWindow.restore();
    settingsWindow.show();
    settingsWindow.focus();
    if (PROVIDERS.includes(provider)) settingsWindow.webContents.send('desktop:select-provider', provider);
  };
  if (settingsWindow.webContents.isLoading()) settingsWindow.webContents.once('did-finish-load', show);
  else show();
}
function setEcoMode(next) {
  const enabled = next === true;
  if (settings.ecoMode === enabled) return;
  settings.ecoMode = enabled;
  saveSettings();
  // Existing live views remain untouched. The additional views are destroyed
  // by syncWindows, freeing renderer memory and their extra WebSocket clients.
  // Switching off restores the user's stored layout without editing profiles.
  syncWindows();
  pushSnapshot();
  // Replace only the read-only window scanner; it runs much less frequently
  // in ECO while regular UI pages retain their realtime market streams.
  if (process.platform === 'win32' && agent && !quitting) {
    const previous = agent;
    runAgent();
    if (agent !== previous) previous.kill();
  }
  for (const {contents} of toolbarOwners.values()) {
    if (!contents.isDestroyed()) contents.send('desktop:toolbar-language-changed',toolbarLabels());
  }
}
function patchQuickProfile(provider, patch) {
  settings.profiles[provider] = normalizeProfile(provider, { ...settings.profiles[provider], ...patch });
  saveSettings(); syncWindows(); pushSnapshot();
}
function openToolbarMenu(event) {
  const owner = toolbarOwners.get(event.sender.id);
  if (!owner || event.sender.isDestroyed() || owner.win.isDestroyed()) return;
  const { provider, win } = owner;
  const tr = key => nativeT(key,settings.uiLanguage);
  // The standalone window uses dedicated left-side buttons instead of a gear.
  if (!provider) return;
  const profile = settings.profiles[provider];
  const label = LABELS[provider];
  const sides = [
    ['auto', tr('automatic')],
    ['right', tr('right')], ['left', tr('left')], ['top', tr('top')], ['bottom', tr('bottom')],
  ];
  const modes = [
    ['full', tr('full')], ['blocks', tr('blocks')], ['floating', tr('floating')],
    ['multi', tr('multi')],
  ];
  const menu = Menu.buildFromTemplate([
    { label: tr('dockMenu'), click: () => openSettingsWindow(provider) },
    { label: tr('toolbarEcoMenu'), type: 'checkbox',
      checked: settings.ecoMode === true, click: () => setEcoMode(!settings.ecoMode) },
    { type: 'separator' },
    { label: tr('position'), submenu: sides.map(([side, name]) => ({
      label: name, type: 'radio', checked: profile.side === side,
      click: () => patchQuickProfile(provider, { side }),
    })) },
    { label: tr('mode'), submenu: modes.map(([mode, name]) => ({
      label: name, type: 'radio', checked: profile.mode === mode,
      click: () => patchQuickProfile(provider, { mode, follow: mode !== 'floating' }),
    })) },
    { type: 'separator' },
    { label: tr('browser'), click: () => void shell.openExternal(WEBSITE) },
    { label: tr('detach') + label, click: () => {
      settings.profiles[provider].enabled = false;
      manualAttached.delete(provider);
      saveSettings(); closeProvider(provider); pushSnapshot();
    } },
  ]);
  menu.popup({ window: win });
}
function candidateWindows() {
  // Only native OS window metadata is exposed to the local settings panel.
  // Exclude only this app, not every Electron.exe window (some terminals use Electron).
  return detected.filter(item => item.width >= 140 && item.height >= 80
    && item.pid !== process.pid && !/^h00k desktop$/i.test(item.exe));
}
function findTarget(provider) {
  const all = candidateWindows();
  const manualId = manualTargets.get(provider);
  const hint = settings.profiles[provider].targetHint;
  // Native HWND values may be recycled when apps close. A stale handle must
  // not redirect h00k onto an unrelated process after the agent reconnects.
  const explicit = all.find(item => item.id === manualId
    && (!hint || item.exe === hint.exe));
  if (explicit) return explicit;
  if (hint) {
    const sameExecutable = all.filter(item => item.exe === hint.exe);
    const selected = sameExecutable.find(item => item.title === hint.title);
    if (selected) return selected;
    // Dynamic price/PnL titles can change; recover only if exactly one window matches.
    if (sameExecutable.length === 1) return sameExecutable[0];
  }
  // A minimized large chart must never win over a smaller usable window.
  // Keep minimized matches as a fallback so the UI can report their status.
  return all.filter(item => matchesTerminal(provider, item))
    .sort((a,b) => Number(a.minimized)-Number(b.minimized)
      || (b.width*b.height)-(a.width*a.height))[0] || null;
}
function findMultiTargets(provider) {
  const candidates = candidateWindows();
  const selected = findTarget(provider);
  // A manually selected external app can join the automatically recognized
  // copies of MetaScalp, Tiger.Trade or Vataga. Do not auto-attach to every app.
  const recognized = candidates.filter(item => matchesTerminal(provider,item))
    .sort((a,b) => Number(a.minimized)-Number(b.minimized)
      || (b.width*b.height)-(a.width*a.height));
  const priorities=[selected,...recognized].filter(Boolean);
  // A minimized instance must not consume one of the four slots ahead of
  // a visible terminal that can actually receive a panel.
  const ordered=[
    ...priorities.filter(item=>!item.minimized),
    ...priorities.filter(item=>item.minimized),
  ];
  const result=[], used=new Set();
  for (const item of ordered) {
    if (used.has(item.id)) continue;
    used.add(item.id);
    result.push(item);
    if (result.length === MAX_MULTI_WINDOWS) break;
  }
  return result;
}
function externalRect(item) {
  // The Win32 agent reports physical pixels. Electron expects DIP coordinates.
  const topLeft = screen.screenToDipPoint({ x: item.left, y: item.top });
  const bottomRight = screen.screenToDipPoint({ x: item.left+item.width, y: item.top+item.height });
  return {
    x: topLeft.x, y: topLeft.y,
    width: Math.max(1,bottomRight.x-topLeft.x), height: Math.max(1,bottomRight.y-topLeft.y),
  };
}
function ensureContentWindows(provider, ids, mode = 'full') {
  let group = windows.get(provider);
  if (!group) { group = new Map(); windows.set(provider,group); }
  const windowMode = mode === 'floating' ? 'floating' : 'docked';
  for (const [id,win] of group) {
    if (!ids.includes(id) || win.__h00kMode !== windowMode) {
      group.delete(id);
      if (!win.isDestroyed()) win.destroy();
    }
  }
  for (const id of ids) if (!group.has(id) || group.get(id).isDestroyed()) group.set(id,makeContentWindow(provider,id,mode));
  return group;
}
function closeProvider(provider) {
  hiddenProviders.delete(provider);
  lastLayoutKeys.delete(provider);
  autoPlacements.delete(provider);
  for (const key of multiPlacements.keys()) if (key.startsWith(provider+':')) multiPlacements.delete(key);
  for (const key of missingMultiSince.keys()) if (key.startsWith(provider+':')) missingMultiSince.delete(key);
  const group = windows.get(provider);
  if (!group) return;
  for (const win of group.values()) if (!win.isDestroyed()) win.destroy();
  windows.delete(provider);
}
function applyBounds(win, bounds, alwaysOnTop) {
  if (win.isDestroyed()) return;
  const old = win.getBounds();
  if (old.x !== bounds.x || old.y !== bounds.y || old.width !== bounds.width || old.height !== bounds.height) {
    win.__autoPlacing = true;
    win.setBounds(bounds, false);
    // Win32 moved/resized events may arrive after setBounds returns; do not persist them as user drag.
    clearTimeout(win.__autoPlaceReset);
    win.__autoPlaceReset = setTimeout(() => { win.__autoPlacing = false; }, 320);
  }
  if (win.isAlwaysOnTop() !== alwaysOnTop) win.setAlwaysOnTop(alwaysOnTop);
  if (!win.__h00kLoaded && Date.now() >= win.__nextLoadAt) {
    win.__h00kLoaded = true;
    win.loadURL(win.__h00kUrl).catch(err => {
      if (win.isDestroyed()) return;
      win.__h00kLoaded = false;
      win.__nextLoadAt = Date.now() + 15_000; // bounded retry; never flood h00k.top on outage
      console.warn('h00k load error (retry in 15s):', err.message);
    });
  }
  if (!win.isVisible()) win.showInactive();
  win.__h00kUpdateResizeHandle?.();
}
// Restrict resizing to a local isolated view, rather than h00k.top renderer
// messages. The bottom of a top-docked pane remains 2 DIP above the terminal.
function dockResizeOwner(event) {
  const owner = resizeOwners.get(event.sender.id);
  if (!owner || owner.contents !== event.sender || owner.win.isDestroyed() ||
      owner.win.__h00kMode !== 'docked' || owner.win.__h00kDockSide !== 'top' ||
      !owner.win.isVisible() || !PROVIDERS.includes(owner.provider) ||
      settings.profiles[owner.provider]?.mode === 'multi') return null;
  return owner;
}
function startDockHeightResize(event) {
  const owner = dockResizeOwner(event);
  if (!owner || [...activeDockResizes.values()].some(item => item.provider === owner.provider)) return;
  const cursor = screen.getCursorScreenPoint();
  activeDockResizes.set(event.sender.id, {
    ...owner, cursorY: cursor.y, height: owner.win.getBounds().height,
    lastChangeAt: 0, changed: false,
  });
}
function moveDockHeightResize(event, force = false) {
  const owner = dockResizeOwner(event);
  const state = activeDockResizes.get(event.sender.id);
  if (!owner || !state || state.win !== owner.win) return;
  const now = Date.now();
  if (!force && now - state.lastChangeAt < 24) return; // Avoid excess layout work during drag.
  state.lastChangeAt = now;
  const target = findTarget(owner.provider);
  if (!target || target.minimized) return;
  const rect = externalRect(target);
  const work = screen.getDisplayMatching(rect).workArea;
  const maxHeight = Math.min(1000,Math.floor(rect.y - work.y - TOP_DOCK_CLEARANCE));
  if (maxHeight < 140) return;
  const currentY = screen.getCursorScreenPoint().y;
  const difference = state.cursorY - currentY;
  if (Math.abs(difference) < 2 && !state.changed) return;
  const desired = Math.round(Math.max(140,Math.min(maxHeight,state.height + difference)));
  const old = settings.profiles[owner.provider];
  if (!old?.enabled || old.mode === 'floating') return;
  if (old.height === desired && old.side === 'top') return;
  // A manual resize intentionally pins an AUTO placement to the current top
  // side, preventing auto-placement from jumping to a different edge mid-drag.
  settings.profiles[owner.provider] = normalizeProfile(owner.provider,{
    ...old, side: 'top', height: desired,
  });
  state.changed = true;
  syncWindows(); // Reuse existing webviews, no reload or WebSocket restart.
}
function finishDockHeightResize(event) {
  const state = activeDockResizes.get(event.sender.id);
  if (!state) return;
  moveDockHeightResize(event,true);
  activeDockResizes.delete(event.sender.id);
  if (state.changed) { saveSettings(); pushSnapshot(); }
}
function hideDockedWindows(provider, message) {
  const group = windows.get(provider);
  if (group) for (const win of group.values()) if (!win.isDestroyed()) win.hide();
  const now = Date.now();
  if (!hiddenProviders.has(provider)) hiddenProviders.set(provider, now);
  else if (now - hiddenProviders.get(provider) >= (settings.ecoMode ? ECO_HIDDEN_RECLAIM_MS : HIDDEN_RECLAIM_MS)) {
    // A hidden h00k webview still runs timers and network requests; reclaim it after inactivity.
    closeProvider(provider);
  }
  lastDockStatus[provider] = message;
}
function deferMultiPaneRemoval(provider,group,key,win) {
  const scoped=provider+':'+key;
  if (!missingMultiSince.has(scoped)) missingMultiSince.set(scoped,Date.now());
  if (!win.isDestroyed()) win.hide();
  if (Date.now()-missingMultiSince.get(scoped)<MULTI_MISSING_GRACE_MS) return;
  missingMultiSince.delete(scoped);
  group.delete(key);
  if (!win.isDestroyed()) win.destroy();
  multiPlacements.delete(scoped);
}
function syncMultiWindows(provider, profile, previousLayoutKey, layoutKey) {
  const targets = findMultiTargets(provider);
  // Give priority to earlier enabled providers so the global limit is stable
  // across ticks. One user cannot accidentally start twelve independent
  // full-site scanners by activating all three terminal families.
  const earlierActive = PROVIDERS.slice(0,PROVIDERS.indexOf(provider))
    .flatMap(id => [...(windows.get(id)?.entries() || [])])
    .filter(([id,win]) => id.startsWith('multi:') && !win.isDestroyed() && win.isVisible())
    .length;
  // ECO: keep at most one live multi pane per enabled terminal family.
  // Normal mode retains the user's original 4/6 multi-window limits.
  const allowed = Math.max(0,MAX_TOTAL_MULTI_PANES-earlierActive);
  const eligibleTargets = targets.filter(item=>!item.minimized)
    .slice(0,settings.ecoMode ? Math.min(allowed,1) : allowed);
  // A multi-window pane always shows the full h00k site (not widget fragments).
  // Its key is the native window ID; no HWND is saved to disk across reboots.
  const group = windows.get(provider) || new Map();
  windows.set(provider,group);
  const desired = new Set(eligibleTargets.map(item=>'multi:'+item.id));
  for (const [id,win] of group) {
    if (desired.has(id) && win.__h00kMode==='docked') continue;
    if (id.startsWith('multi:') && win.__h00kMode==='docked' && !settings.ecoMode) {
      deferMultiPaneRemoval(provider,group,id,win);
    } else {
      group.delete(id);
      if (!win.isDestroyed()) win.destroy();
      multiPlacements.delete(provider+':'+id);
    }
  }
  const earlierH00kPanes = PROVIDERS.slice(0,PROVIDERS.indexOf(provider))
    .flatMap(id => [...(windows.get(id)?.values() || [])])
    .filter(win => !win.isDestroyed() && win.isVisible())
    .map(win => win.getBounds());
  const native = candidateWindows().filter(item=>!item.minimized);
  const monitors = screen.getAllDisplays().map(display=>display.workArea);
  const reserved = [];
  let attached=0;
  for (const target of eligibleTargets) {
    const key='multi:'+target.id;
    const rect=externalRect(target);
    const blocked = [
      ...native.filter(item=>item.id!==target.id).map(externalRect),
      ...earlierH00kPanes,...reserved,
    ];
    const automatic=profile.side==='auto';
    const placeKey=provider+':'+key;
    const placement=automatic
      ? chooseDockPlacement(rect,monitors,profile.width,profile.height,1,
          multiPlacements.get(placeKey),blocked)
      : null;
    if (automatic) {
      if (placement) multiPlacements.set(placeKey,{side:placement.side,workIndex:placement.workIndex});
      else multiPlacements.delete(placeKey);
    } else multiPlacements.delete(placeKey);
    const work=screen.getDisplayMatching(rect).workArea;
    const boxes=automatic ? placement?.boxes || [] :
      dockRects(rect,work,profile.side,profile.width,profile.height,1);
    const bounds=boxes[0];
    const pane=group.get(key);
    if (!bounds || blocked.some(other=>intersectsRect(bounds,other))) {
      // Temporarily hide an obstructed pane instead of reloading the entire
      // screener on a transient obstacle or a single missed Win32 frame.
      // Reclaim it promptly if the obstruction persists.
      if (pane) deferMultiPaneRemoval(provider,group,key,pane);
      continue; // Never cover a trading window when space is unavailable.
    }
    const win=pane && !pane.isDestroyed() ? pane : makeContentWindow(provider,'full','multi',key);
    if (win!==pane)group.set(key,win);
    missingMultiSince.delete(provider+':'+key);
    // Follow=off may preserve a manually positioned panel, but the terminal
    // can subsequently be dragged over that old position. Evacuate it instead
    // of covering the trading controls, even when follow remains disabled.
    const stale=intersectsRect(win.getBounds(),rect) ||
      blocked.some(other=>intersectsRect(win.getBounds(),other));
    win.__h00kDockSide = automatic ? placement?.side : profile.side;
    win.__h00kUpdateResizeHandle?.();
    if (profile.follow || previousLayoutKey !== layoutKey || !win.isVisible() || stale) {
      applyBounds(win,bounds,profile.alwaysOnTop);
    } else if (win.isAlwaysOnTop()!==profile.alwaysOnTop) {
      win.setAlwaysOnTop(profile.alwaysOnTop);
    }
    reserved.push(win.getBounds());
    attached++;
  }
  lastLayoutKeys.set(provider,layoutKey);
  if (!attached) {
    hideDockedWindows(provider, 'Мультивікна: 0/'+targets.length);
  } else {
    hiddenProviders.delete(provider);
    lastDockStatus[provider]='Мультивікна: '+attached+'/'+targets.length;
  }
}
function preferredFloatingBounds(provider, id, profile, fallback, restore) {
  if (!restore) return fallback;
  return restoreFloatingBounds(profile.floatingBounds[id], screen.getAllDisplays(), fallback);
}
function syncWindows() {
  for (const provider of PROVIDERS) {
    const profile = settings.profiles[provider];
    // On a mode switch, immediately retire old multi-window views, even if
    // no terminal is running. Otherwise their hidden pages can keep polling
    // until the 30-second missing-terminal reclamation timer expires.
    if (profile.mode !== 'multi' &&
        [...(windows.get(provider)?.keys() || [])].some(id=>id.startsWith('multi:'))) {
      closeProvider(provider);
    }
    const ready = settings.setupComplete && profile.enabled && (profile.autoAttach || manualAttached.has(provider));
    if (!ready) { closeProvider(provider); lastDockStatus[provider] = 'Вимкнено'; continue; }
    const target = findTarget(provider);
    const layoutKey = floatingLayoutKey(profile);
    const previousLayoutKey = lastLayoutKeys.get(provider);
    if (profile.mode === 'multi') {
      syncMultiWindows(provider,profile,previousLayoutKey,layoutKey);
      continue;
    }
    if (!target) {
      const layoutChanged = previousLayoutKey !== undefined && previousLayoutKey !== layoutKey;
      lastLayoutKeys.set(provider, layoutKey);
      if (profile.mode === 'floating') {
        // Truly independent floating panels can be launched without a terminal.
        hiddenProviders.delete(provider);
        const ids = settings.ecoMode ? availablePanels(profile).slice(0,1) : availablePanels(profile);
        const group = ensureContentWindows(provider, ids, profile.mode);
        const work = screen.getPrimaryDisplay().workArea;
        const boxes = floatingRects(null, work, profile.width, profile.height, ids.length,
          profile.side === 'auto' ? 'right' : profile.side);
        ids.forEach((id, index) => {
          const win = group.get(id);
          if (!win || win.isDestroyed()) return;
          const firstPlacement = !win.isVisible();
          if (!profile.follow && !layoutChanged && !firstPlacement) {
            if (win.isAlwaysOnTop() !== profile.alwaysOnTop) win.setAlwaysOnTop(profile.alwaysOnTop);
            return;
          }
          const restore = firstPlacement && !profile.follow && !layoutChanged;
          applyBounds(win, preferredFloatingBounds(provider, id, profile, boxes[index], restore), profile.alwaysOnTop);
        });
        lastDockStatus[provider] = 'Плаваючі панелі без термінала';
        continue;
      }
      hideDockedWindows(provider, 'Термінал не знайдено: запустіть його або виберіть вікно вручну');
      continue;
    }
    if (target.minimized && profile.mode !== 'floating') {
      hideDockedWindows(provider, 'Термінал згорнуто');
      continue;
    }
    hiddenProviders.delete(provider);
    const ids = settings.ecoMode ? availablePanels(profile).slice(0,1) : availablePanels(profile);
    const rect = externalRect(target);
    const work = screen.getDisplayMatching(rect).workArea;
    // All other non-minimized application windows are obstacles. Both target
    // and obstacles are converted from Win32 physical pixels to Electron DIP.
    // Windows in other apps stay in place; this never changes their z-order.
    // Earlier h00k profiles are also obstacles: two separately docked
    // terminal workspaces must never be placed on top of one another.
    // Only consider earlier profiles to keep priority deterministic and avoid
    // oscillation from counting last tick's later-profile positions.
    const earlierH00kPanes = PROVIDERS.slice(0,PROVIDERS.indexOf(provider))
      .flatMap(id => [...(windows.get(id)?.values() || [])])
      .filter(win => !win.isDestroyed() && win.isVisible())
      .map(win => win.getBounds());
    const occupied = [
      ...candidateWindows()
        .filter(item => item.id !== target.id && !item.minimized)
        .map(item => externalRect(item)),
      ...earlierH00kPanes,
    ];
    const automatic = profile.mode !== 'floating' && profile.side === 'auto';
    const placement = automatic
      ? chooseDockPlacement(rect, screen.getAllDisplays().map(display => display.workArea),
          profile.width, profile.height, ids.length, autoPlacements.get(provider), occupied)
      : null;
    if (automatic) {
      if (placement) autoPlacements.set(provider, {side:placement.side, workIndex:placement.workIndex});
      else autoPlacements.delete(provider);
    } else autoPlacements.delete(provider);
    const effectiveSide = automatic ? placement?.side : profile.side;
    const resolvedKey = automatic
      ? layoutKey + ':auto:' + (effectiveSide || 'none') + ':' + (placement?.workIndex ?? -1)
      : layoutKey;
    const layoutChanged = previousLayoutKey !== undefined && previousLayoutKey !== resolvedKey;
    lastLayoutKeys.set(provider, resolvedKey);
    const boxes = profile.mode === 'floating'
      ? floatingRects(rect, work, profile.width, profile.height, ids.length,
          profile.side === 'auto' ? 'right' : profile.side)
      : automatic ? placement?.boxes || []
      : dockRects(rect, work, profile.side, profile.width, profile.height, ids.length);
    // Explicitly selected dock sides must also avoid covering other apps.
    const blockedManual = profile.mode !== 'floating' && !automatic &&
      boxes.some(box => occupied.some(other => intersectsRect(box,other)));
    if (boxes.length !== ids.length || blockedManual) {
      const availableWithoutOtherWindows = automatic && !placement
        ? chooseDockPlacement(rect, screen.getAllDisplays().map(display => display.workArea),
            profile.width, profile.height, ids.length)
        : null;
      const problem = blockedManual || availableWithoutOtherWindows
        ? 'Місце для h00k зайняте іншим вікном; перемістіть його або виберіть Автоматично'
        : automatic
        ? 'Немає безпечного місця біля термінала; зменшіть його вікно або звільніть простір'
        : 'Замало місця з вибраного боку; виберіть Автоматично або іншу сторону';
      hideDockedWindows(provider, problem);
      continue;
    }
    const group = ensureContentWindows(provider, ids, profile.mode);
    ids.forEach((id,index) => {
      const win = group.get(id);
      if (!win || win.isDestroyed()) return;
      const firstPlacement = !win.isVisible();
      win.__h00kDockSide = profile.mode === 'floating' ? null : effectiveSide;
      win.__h00kUpdateResizeHandle?.();
      // Even with follow disabled, evacuate a docked pane when another
      // application moves over its current rectangle.
      const overlapNow = profile.mode !== 'floating' &&
        (intersectsRect(win.getBounds(),rect) ||
          occupied.some(other => intersectsRect(win.getBounds(),other)));
      if (!profile.follow && !layoutChanged && !firstPlacement && !overlapNow) {
        if (win.isAlwaysOnTop() !== profile.alwaysOnTop) win.setAlwaysOnTop(profile.alwaysOnTop);
        return; // Preserve a manually positioned pane until it becomes obstructed.
      }
      const restore = profile.mode === 'floating' && !profile.follow && firstPlacement && !layoutChanged;
      applyBounds(win, profile.mode === 'floating'
        ? preferredFloatingBounds(provider, id, profile, boxes[index], restore)
        : boxes[index], profile.alwaysOnTop);
    });
    const sideNames = {right:'праворуч',left:'ліворуч',top:'зверху',bottom:'знизу'};
    lastDockStatus[provider] = profile.mode === 'floating' ? 'Плаваючі панелі'
      : 'Прикріплено ' + (automatic ? 'автоматично ' : '') + sideNames[effectiveSide] + ' до ' + target.title;
  }
}
function snapshot() {
  return {
    settings, remoteLink: { enabled: settings.remoteLinkEnabled === true, status: desktopLinkStatus }, terminals: PROVIDERS.map(provider=>({
      id:provider, label:LABELS[provider],
      target:findTarget(provider), selectedWindowId: manualTargets.get(provider) || null,
      status:lastDockStatus[provider] || 'Очікування',
    })),
    windows:candidateWindows().map(item=>({
      id:item.id, exe:item.exe, title:item.title, minimized:item.minimized, width:item.width, height:item.height,
    })),
  };
}
function pushSnapshot() {
  if (!settingsWindow || settingsWindow.isDestroyed() || settingsWindow.webContents.isLoading()) return;
  const data = snapshot();
  const key = JSON.stringify(data);
  if (key === previousSnapshots) return;
  previousSnapshots = key;
  settingsWindow.webContents.send('desktop:snapshot-pushed',data);
}
function acceptWindows(rows) {
  if (!Array.isArray(rows)) return;
  detected = rows.filter(item => item && typeof item.id === 'string'
    && typeof item.exe === 'string' && typeof item.title === 'string'
    && [item.left,item.top,item.width,item.height].every(Number.isFinite))
    .slice(0,300);
  // Terminal titles (prices/PnL) change much more often than window geometry.
  // Recalculate docking immediately on geometry changes, but not 4-6 times
  // per second just because text changed. Periodic passes still reclaim
  // hidden webviews and allow recovery if a previous placement failed.
  const geometry = JSON.stringify(detected.map(item => [
    item.id,item.pid,item.exe,item.left,item.top,item.width,item.height,item.minimized,
  ]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const now = Date.now();
  const moved = geometry !== previousWindowGeometry;
  previousWindowGeometry = geometry;
  if (moved || forceNextLayout || now-lastGeometrySyncAt >= GEOMETRY_REFRESH_MS) {
    forceNextLayout = false;
    lastGeometrySyncAt = now;
    syncWindows();
  }
  // Retain timely status updates while limiting settings IPC allocations when
  // terminal captions are constantly changing.
  if (moved || now-lastTrackerSnapshotAt >= (settings.ecoMode ? 5_000 : TITLE_SNAPSHOT_MS)) {
    lastTrackerSnapshotAt = now;
    pushSnapshot();
  }
}
function runAgent() {
  if (process.platform !== 'win32' || quitting) return;
  const script = app.isPackaged
    ? path.join(process.resourcesPath,'win-agent.ps1')
    : path.join(__dirname,'win-agent.ps1');
  const child = spawn('powershell.exe',[
    '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,
  ],{
    windowsHide:true,stdio:['ignore','pipe','pipe'],
    env:{...process.env,H00K_AGENT_INTERVAL_MS:String(settings.ecoMode ? ECO_AGENT_INTERVAL_MS : 250)},
  });
  agent = child;
  const reader = readline.createInterface({input:child.stdout});
  reader.on('line',line => {
    if (agent !== child) return; // Ignore a replaced ECO/normal scanner.
    try { acceptWindows(JSON.parse(line)); } catch { /* diagnostic output is not window JSON */ }
  });
  child.stderr.on('data',chunk => console.warn('Windows window-agent:',String(chunk).slice(0,400)));
  child.on('error',err => console.warn('Cannot start window-agent:',err.message));
  child.on('close',() => {
    if (agent !== child) return;
    agent = null;
    // No fresh native snapshots means that all old HWNDs/positions are stale.
    // Hide attached panes until the agent reconnects and reports real windows.
    if (!quitting) {
      acceptWindows([]);
      setTimeout(runAgent,3000);
    }
  });
}
function verifySettingsSender(event) {
  if (!settingsWindow || event.sender !== settingsWindow.webContents) throw new Error('Untrusted IPC sender');
}
function toolbarLabels() {
  return {
    title:nativeT('toolbarTitle',settings.uiLanguage),
    aria:nativeT('toolbarAria',settings.uiLanguage),
    minimize:nativeT('toolbarMinimize',settings.uiLanguage),
    fullscreen:nativeT('toolbarFullscreen',settings.uiLanguage),
    exitFullscreen:nativeT('toolbarExitFullscreen',settings.uiLanguage),
    close:nativeT('toolbarClose',settings.uiLanguage),
    docking:nativeT('toolbarDocking',settings.uiLanguage),
    browser:nativeT('toolbarBrowser',settings.uiLanguage),
    browserTitle:nativeT('browser',settings.uiLanguage),
    metascalp:LABELS.metascalp,
    tiger:LABELS.tiger,
    vataga:LABELS.vataga,
    configure:nativeT('configure',settings.uiLanguage),
    ecoMode:settings.ecoMode === true,
    ecoEnable:nativeT('toolbarEcoEnable',settings.uiLanguage),
    ecoDisable:nativeT('toolbarEcoDisable',settings.uiLanguage),
  };
}
function registerIpc() {
  ipcMain.on('desktop:toolbar-menu', openToolbarMenu);
  ipcMain.on('desktop:toolbar-eco-toggle', event => {
    const owner = toolbarOwners.get(event.sender.id);
    if (!owner || owner.contents !== event.sender || owner.win.isDestroyed() ||
        owner.provider !== null) return; // Local standalone toolbar only.
    setEcoMode(!settings.ecoMode);
  });
  ipcMain.on('desktop:dock-resize-start', startDockHeightResize);
  ipcMain.on('desktop:dock-resize-move', moveDockHeightResize);
  ipcMain.on('desktop:dock-resize-end', finishDockHeightResize);
  ipcMain.handle('desktop:toolbar-language',event => {
    const owner = toolbarOwners.get(event.sender.id);
    if (!owner || owner.contents !== event.sender || owner.win.isDestroyed())
      throw new Error('Untrusted toolbar sender');
    return toolbarLabels();
  });
  ipcMain.on('desktop:toolbar-action',(event,action) => {
    const owner=toolbarOwners.get(event.sender.id);
    // Only the local, sandboxed standalone toolbar can open settings/external
    // URLs. h00k.top never receives the IPC preload or controls the target.
    if (!owner || owner.contents!==event.sender || owner.provider!==null ||
        owner.win.isDestroyed() || !supportsOverlay(process.platform,os.release(),process.versions.electron)) return;
    if (action==='docking') openSettingsWindow();
    else if (PROVIDERS.includes(action)) openSettingsWindow(action);
    else if (action==='browser') void shell.openExternal(WEBSITE);
  });
  ipcMain.on('desktop:toolbar-control',(event,action) => {
    const owner=toolbarOwners.get(event.sender.id);
    if (!owner || owner.contents!==event.sender || owner.provider!==null ||
        owner.win.isDestroyed() || !supportsOverlay(process.platform,os.release(),process.versions.electron)) return;
    if (action==='minimize') {
      owner.win.minimize();
    } else if (action==='fullscreen') {
      owner.win.setFullScreen(!owner.win.isFullScreen());
    } else if (action==='close') {
      owner.win.close();
    }
    // Other actions are intentionally ignored; remote h00k.top has no IPC.
  });
  ipcMain.handle('desktop:set-language',(event,language) => {
    verifySettingsSender(event);
    if (!LANGUAGES.includes(language)) throw new Error('Invalid Desktop UI language');
    if (settings.uiLanguage !== language) {
      settings.uiLanguage=language;
      saveSettings();
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.setTitle('h00k Desktop • '+nativeT('settingsTitle',language));
      }
      for (const {contents} of toolbarOwners.values()) {
        if (!contents.isDestroyed()) contents.send('desktop:toolbar-language-changed',toolbarLabels());
      }
    }
    return true;
  });
  ipcMain.handle('desktop:snapshot',event => { verifySettingsSender(event); return snapshot(); });
  ipcMain.handle('desktop:remote-link', (event, enabled) => {
    verifySettingsSender(event);
    if (typeof enabled !== 'boolean') throw new Error('Invalid remote link option');
    settings.remoteLinkEnabled = enabled;
    saveSettings();
    syncDesktopLink();
    pushSnapshot();
    return snapshot();
  });
  ipcMain.handle('desktop:save',(event,provider,patch) => {
    verifySettingsSender(event);
    if (!PROVIDERS.includes(provider) || !patch || typeof patch !== 'object') throw new Error('Invalid profile');
    const previous = settings.profiles[provider];
    const update = normalizeProfile(provider,{...previous,...patch});
    // Floating panels are manually draggable by default.
    if (previous.mode !== 'floating' && update.mode === 'floating' && !Object.hasOwn(patch,'follow')) update.follow = false;
    settings.profiles[provider] = update;
    settings.setupComplete = true; // Saving the first-run configuration completes onboarding.
    saveSettings(); syncWindows(); pushSnapshot();
    return snapshot();
  });
  ipcMain.handle('desktop:pick',(event,provider,id) => {
    verifySettingsSender(event);
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid terminal');
    if (id === '') {
      // "Автоматично знайти" must actually remove the previous manual target.
      manualTargets.delete(provider);
      settings.profiles[provider].targetHint = null;
    } else {
      const target = candidateWindows().find(item => item.id === id);
      if (!target) throw new Error('Window not found');
      manualTargets.set(provider,id);
      settings.profiles[provider].targetHint = {exe:target.exe,title:target.title};
    }
    saveSettings(); syncWindows(); pushSnapshot(); return snapshot();
  });
  ipcMain.handle('desktop:attach',(event,provider) => {
    verifySettingsSender(event);
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid terminal');
    settings.profiles[provider].enabled = true;
    settings.setupComplete = true;
    manualAttached.add(provider);
    saveSettings(); syncWindows(); pushSnapshot(); return snapshot();
  });
  ipcMain.handle('desktop:detach',(event,provider) => {
    verifySettingsSender(event);
    if (!PROVIDERS.includes(provider)) throw new Error('Invalid terminal');
    settings.profiles[provider].enabled = false;
    manualAttached.delete(provider);
    closeProvider(provider); saveSettings(); pushSnapshot(); return snapshot();
  });
  ipcMain.handle('desktop:open-browser',event => {
    verifySettingsSender(event);
    return shell.openExternal(WEBSITE); // Never accept an arbitrary URL from the renderer.
  });
  ipcMain.handle('desktop:standalone',event => {
    verifySettingsSender(event);
    if (!standalone || standalone.isDestroyed()) {
      standalone = new BrowserWindow({
        title:'h00k Desktop', width:1280,height:850,minWidth:400,minHeight:300,
        backgroundColor:'#070d18',autoHideMenuBar:true,
        ...standaloneWindowChrome(process.platform,os.release(),process.versions.electron),
        webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true,
          partition:'persist:h00k',webSecurity:true},
      });
      // The isolated toolbar lives in a compact 30px chrome row. Apply the same
      // safety inset on every page, including fixed Terminal and fullscreen
      // charts, on each successful navigation to h00k.top.
      guardWebsite(standalone, process.platform === 'win32'
        ? standaloneHeaderCSS()
        : null);
      attachDockToolbar(standalone, null); // Sandboxed local settings, fullscreen, close; site receives no IPC.
      standalone.loadURL(webURL('full')).catch(err=>console.warn('h00k load error:',err.message));
      standalone.on('closed',()=>{standalone=null;});
    } else standalone.show();
    return true;
  });
}
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => openSettingsWindow());
  app.whenReady().then(() => {
    // Never silently load an unpatched embedded browser.
    if (isUnmaintainedElectron(process.versions.electron)) {
      if (dialog.showMessageBoxSync(legacyBrowserWarning()) !== 1) { app.quit(); return; }
    }
    loadSettings();registerIpc();createSettingsWindow();runAgent();syncDesktopLink();
    if (process.platform !== 'win32') {
      for (const provider of PROVIDERS) lastDockStatus[provider] = 'Прикріплення вікон підтримується лише у Windows';
    }
  });
  app.on('before-quit',()=>{quitting=true;desktopLinkClient?.stop();if(agent){agent.kill();agent=null;}});
  app.on('window-all-closed',()=>app.quit());
}

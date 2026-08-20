const { app, BrowserWindow, globalShortcut, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let savedBounds = {};
let tray = null;
let mapWindow = null;
let planWindow = null;
let masterPlan = [];

function stateFile() {
  return path.join(app.getPath('userData'), 'window-positions.json');
}

function loadBounds() {
  try {
    savedBounds = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
  } catch {
    savedBounds = {};
  }
}

function saveBounds() {
  try {
    fs.writeFileSync(stateFile(), JSON.stringify(savedBounds, null, 2));
  } catch (error) {
    console.error('无法保存窗口位置：', error);
  }
}

function isVisibleOnAnyDisplay(bounds) {
  return screen.getAllDisplays().some(({ workArea }) => (
    bounds.x < workArea.x + workArea.width &&
    bounds.x + bounds.width > workArea.x &&
    bounds.y < workArea.y + workArea.height &&
    bounds.y + bounds.height > workArea.y
  ));
}

function defaultPlanBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 440;
  const height = 560;
  return { width, height, x: area.x + area.width - width - 18, y: area.y + 18 };
}

function publishMasterPlan() {
  if (planWindow && !planWindow.isDestroyed()) planWindow.webContents.send('master-plan:update', masterPlan);
}

function createPlanOverlay() {
  if (planWindow && !planWindow.isDestroyed()) return planWindow;
  const fallback = defaultPlanBounds();
  const restored = savedBounds['master-plan'];
  const bounds = restored && isVisibleOnAnyDisplay(restored) ? restored : fallback;
  planWindow = new BrowserWindow({
    ...bounds,
    minWidth: 360,
    minHeight: 360,
    maxWidth: 620,
    maxHeight: 900,
    frame: false,
    transparent: false,
    backgroundColor: '#0b100d',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  planWindow.setAlwaysOnTop(true, 'screen-saver');
  planWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  planWindow.loadFile('overlay.html');
  planWindow.webContents.on('did-finish-load', publishMasterPlan);
  planWindow.on('blur', () => {
    setTimeout(() => {
      if (planWindow && !planWindow.isDestroyed() && planWindow.isVisible()) {
        planWindow.setAlwaysOnTop(true, 'screen-saver');
        planWindow.moveTop();
      }
    }, 80);
  });
  let saveTimer;
  const rememberPosition = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (planWindow && !planWindow.isDestroyed()) {
        savedBounds['master-plan'] = planWindow.getBounds();
        saveBounds();
      }
    }, 250);
  };
  planWindow.on('move', rememberPosition);
  planWindow.on('resize', rememberPosition);
  planWindow.on('closed', () => { planWindow = null; });
  return planWindow;
}

function showPlan() {
  const win = createPlanOverlay();
  win.showInactive();
  win.setAlwaysOnTop(true, 'screen-saver');
  win.moveTop();
  publishMasterPlan();
}

function hidePlan() {
  if (planWindow && !planWindow.isDestroyed()) planWindow.hide();
}

function togglePlan() {
  const win = createPlanOverlay();
  if (win.isVisible()) hidePlan();
  else showPlan();
}

function createMapWindow() {
  if (mapWindow && !mapWindow.isDestroyed()) return mapWindow;
  mapWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1050,
    minHeight: 600,
    backgroundColor: '#090e0b',
    title: '铁巢炮控地图',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mapWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'map.html'));
  mapWindow.once('ready-to-show', () => mapWindow.show());
  mapWindow.on('closed', () => { mapWindow = null; });
  return mapWindow;
}

function showMap() {
  const win = createMapWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createTray() {
  // 原 tray.ico 已移除（避免使用游戏/版权素材）；托盘改用空图标占位。
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('铁巢炮控终端');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开炮控地图', click: showMap },
    { type: 'separator' },
    { label: '显示总射击计划', click: showPlan },
    { label: '隐藏总射击计划', click: hidePlan },
    { type: 'separator' },
    { label: '退出程序', click: () => app.quit() }
  ]));
  tray.on('click', togglePlan);
  tray.on('double-click', showPlan);
}

app.whenReady().then(() => {
  loadBounds();
  createPlanOverlay();
  createMapWindow();
  createTray();

  const shortcuts = [
    ['Alt+P', showPlan],
    ['Alt+Q', togglePlan],
    ['Alt+C', showMap]
  ];
  shortcuts.forEach(([accelerator, handler]) => {
    if (!globalShortcut.register(accelerator, handler)) console.error(`快捷键注册失败：${accelerator}`);
  });
});

ipcMain.on('overlay:hide', event => {
  BrowserWindow.fromWebContents(event.sender)?.hide();
});
ipcMain.on('overlay:quit', () => app.quit());
ipcMain.handle('master-plan:get', () => masterPlan);
ipcMain.on('master-plan:update', (event, plan) => {
  if (!mapWindow || event.sender !== mapWindow.webContents || !Array.isArray(plan)) return;
  masterPlan = plan.slice(0, 12).map(item => ({ ...item }));
  publishMasterPlan();
});
ipcMain.on('master-plan:destroy-target', (event, targetId) => {
  if (!planWindow || event.sender !== planWindow.webContents || !mapWindow || mapWindow.isDestroyed()) return;
  mapWindow.webContents.send('master-plan:destroy-target', String(targetId));
});

app.on('window-all-closed', event => event.preventDefault());
app.on('will-quit', () => globalShortcut.unregisterAll());

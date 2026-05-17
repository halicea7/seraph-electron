import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'

// ── Settings ──────────────────────────────────────────────────────────────────

interface Settings {
  serverUrl: string | null
  windowWidth: number
  windowHeight: number
  windowX: number | null
  windowY: number | null
}

const SETTINGS_DEFAULTS: Settings = {
  serverUrl: null,
  windowWidth: 1280,
  windowHeight: 800,
  windowX: null,
  windowY: null,
}

const SETTINGS_PATH = join(app.getPath('userData'), 'settings.json')

function loadSettings(): Settings {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(readFileSync(SETTINGS_PATH, 'utf-8')) }
  } catch {
    return { ...SETTINGS_DEFAULTS }
  }
}

function saveSettings(s: Settings): void {
  writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2), 'utf-8')
}

let settings = loadSettings()

// ── Window ────────────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: settings.windowWidth,
    height: settings.windowHeight,
    x: settings.windowX ?? undefined,
    y: settings.windowY ?? undefined,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('moved', () => {
    if (!mainWindow) return
    const [x, y] = mainWindow.getPosition()
    settings.windowX = x
    settings.windowY = y
    saveSettings(settings)
  })

  mainWindow.on('resized', () => {
    if (!mainWindow) return
    const [w, h] = mainWindow.getSize()
    settings.windowWidth = w
    settings.windowHeight = h
    saveSettings(settings)
  })

  // Open external links in the system browser, not the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────

function setupIPC(): void {
  ipcMain.handle('settings:get-server-url', () => settings.serverUrl)

  ipcMain.handle('settings:set-server-url', (_, url: string | null) => {
    settings.serverUrl = url
    saveSettings(settings)
    // Reload so the renderer picks up the new URL
    mainWindow?.webContents.reload()
    return true
  })
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  setupIPC()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
